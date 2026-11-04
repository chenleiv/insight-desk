// @vitest-environment node
import { it, expect, vi, afterAll } from "vitest";
import mongoose from "mongoose";
import { startMongoServer } from "./mongoMemory.js";

const { logger } = vi.hoisted(() => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("../logger.js", () => ({ logger }));

import { Chunk } from "../models.js";
import { embedMissingChunks } from "../rag/embedMissing.js";

let mongo;

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

// Models build their indexes as soon as the connection opens, as on a real start, so the
// index they cannot build is put in the way first, in place of an unsupported one.
it("logs an index that cannot be built, and queries keep working", async () => {
  mongo = await startMongoServer();
  const client = await mongoose.mongo.MongoClient.connect(mongo.getUri("test"));
  await client.db().collection("chunks").createIndex({ embedding: 1 }, { name: "embedding_1", sparse: true });
  await client.close();

  const built = new Promise((resolve) => Chunk.once("index", resolve));
  await mongoose.connect(mongo.getUri("test"));
  const failure = await built;

  expect(failure).toBeInstanceOf(Error);
  expect(logger.error).toHaveBeenCalledWith("Building database indexes failed", { model: "Chunk", message: failure.message });
  expect(mongoose.connection.readyState).toBe(mongoose.ConnectionStates.connected);

  await Chunk.create({ docId: new mongoose.Types.ObjectId(), index: 0, text: "Waiting." });
  expect(await embedMissingChunks({ embed: async () => [0.1] })).toBe(1);
}, 120_000);
