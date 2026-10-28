// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import { Chunk } from "../../models.js";
import { syncDocumentChunks } from "../syncChunks.js";

// Transactions need a replica set, so this runs against a real in-memory one, like Atlas.
let replSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  await mongoose.connect(replSet.getUri());
  await Chunk.init();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Chunk.deleteMany({});
});

const ownerId = new mongoose.Types.ObjectId();
// Long enough to split into several chunks.
const longText = (word) => Array.from({ length: 40 }, (_, i) => `${word} sentence number ${i} about the policy.`).join(" ");

async function storedTexts(docId) {
  const chunks = await Chunk.find({ docId }).sort({ index: 1 }).lean();
  return chunks.map((c) => c.text);
}

describe("syncDocumentChunks against a replica set", () => {
  it("replaces the old chunks with the new ones", async () => {
    const doc = { _id: new mongoose.Types.ObjectId(), ownerId, content: longText("Old"), attachments: [] };
    await syncDocumentChunks(doc);

    const count = await syncDocumentChunks({ ...doc, content: longText("New") });

    const texts = await storedTexts(doc._id);
    expect(texts).toHaveLength(count);
    expect(texts.every((t) => t.startsWith("New"))).toBe(true);
  });

  it("keeps the old chunks when the insert fails midway", async () => {
    const doc = { _id: new mongoose.Types.ObjectId(), ownerId, content: longText("Old"), attachments: [] };
    await syncDocumentChunks(doc);
    const before = await storedTexts(doc._id);
    expect(before.length).toBeGreaterThan(1);

    // Writes the first new chunk inside the transaction, then fails, like a crash mid-insert.
    vi.spyOn(Chunk, "insertMany").mockImplementationOnce(async (chunks, options) => {
      await Chunk.create([chunks[0]], options);
      throw new Error("insert failed midway");
    });

    await expect(syncDocumentChunks({ ...doc, content: longText("New") })).rejects.toThrow("insert failed midway");

    expect(await storedTexts(doc._id)).toEqual(before);
  });
});
