// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { startMongoServer } from "./mongoMemory.js";

vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import { Chunk, Document } from "../models.js";
import { documentScope } from "../access.js";
import { embedMissingChunks } from "../rag/embedMissing.js";

const VECTOR = [0.1, 0.2];

// Every stage of a query plan, as "STAGE" or "IXSCAN(index name)".
function stages(plan, found = []) {
  if (!plan) return found;
  found.push(plan.indexName ? `${plan.stage}(${plan.indexName})` : plan.stage);
  for (const input of plan.inputStage ? [plan.inputStage] : plan.inputStages ?? []) stages(input, found);
  return found;
}
const planOf = async (query) => stages((await query.explain("queryPlanner")).queryPlanner.winningPlan);
const NEWEST_FIRST = { createdAt: -1 };

let mongo;

beforeAll(async () => {
  mongo = await startMongoServer();
  await mongoose.connect(mongo.getUri());
  await Promise.all([Document.init(), Chunk.init()]);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("indexes the real queries use", () => {
  const owner = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    await Document.insertMany(Array.from({ length: 300 }, (_, i) => ({
      title: `Doc ${i}`,
      category: "C",
      content: "Body.",
      ...(i % 3 === 0 ? { demo: true, ownerId: owner } : {}),
    })));
  });

  it("lists a regular user's documents without sorting in memory", async () => {
    const plan = await planOf(Document.find(documentScope({ role: "admin" })).sort(NEWEST_FIRST));

    expect(plan).toContain("IXSCAN(createdAt_-1)");
    expect(plan).not.toContain("SORT");
  });

  it("lists a demo user's documents without sorting in memory", async () => {
    const plan = await planOf(Document.find(documentScope({ role: "demo", _id: owner })).sort(NEWEST_FIRST));

    expect(plan).toContain("IXSCAN(ownerId_1_createdAt_-1)");
    expect(plan).not.toContain("SORT");
  });
});

describe("chunks missing an embedding", () => {
  beforeEach(async () => {
    await Chunk.deleteMany({});
    await Chunk.insertMany([
      { docId: new mongoose.Types.ObjectId(), index: 0, text: "Waiting." },
      { docId: new mongoose.Types.ObjectId(), index: 0, text: "Done.", embedding: VECTOR },
    ]);
  });

  it("are found through the partial index, which skips every other chunk", async () => {
    const query = Chunk.find({ embedding: null });
    const explained = await query.clone().explain("executionStats");

    expect(stages(explained.queryPlanner.winningPlan)).toContain("IXSCAN(embedding_1)");
    expect(explained.executionStats.totalDocsExamined).toBe(1);
    expect((await query.lean()).map((c) => c.text)).toEqual(["Waiting."]);
  });

  it("are filled in, and leave the index once they have a vector", async () => {
    const count = await embedMissingChunks({ embed: async () => VECTOR });

    expect(count).toBe(1);
    const { executionStats } = await Chunk.find({ embedding: null }).explain("executionStats");
    expect(executionStats.nReturned).toBe(0);
    expect(executionStats.totalKeysExamined).toBe(0);
    expect(await Chunk.countDocuments({ "embedding.0": { $exists: true } })).toBe(2);
  });

  it("finds a chunk whose embedding was stored as an explicit null", async () => {
    await Chunk.collection.updateOne({ text: "Done." }, { $set: { embedding: null } });

    expect(await embedMissingChunks({ embed: async () => VECTOR })).toBe(2);
  });
});
