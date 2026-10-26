// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Chunk } from "../../models.js";
import { findUserChunks } from "../findUserChunks.js";

// Runs against a real in-memory MongoDB, so Mongoose casting and filtering are exercised.
let mongo;
const userOne = new mongoose.Types.ObjectId();
const userTwo = new mongoose.Types.ObjectId();
const docOne = new mongoose.Types.ObjectId();
const docTwo = new mongoose.Types.ObjectId();
const docOrphan = new mongoose.Types.ObjectId();

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Chunk.insertMany([
    { docId: docOne, ownerId: userOne, index: 0, text: "User one, first chunk." },
    { docId: docOne, ownerId: userOne, index: 1, text: "User one, second chunk." },
    { docId: docTwo, ownerId: userTwo, index: 0, text: "User two, private chunk." },
    { docId: docOrphan, ownerId: null, index: 0, text: "Chunk without an owner." },
  ]);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("findUserChunks (MongoDB)", () => {
  it("returns only the owner's chunks when given the id as a string", async () => {
    const result = await findUserChunks(userOne.toString());

    expect(result.map((c) => c.text).sort()).toEqual([
      "User one, first chunk.",
      "User one, second chunk.",
    ]);
    expect(result.every((c) => c.ownerId.equals(userOne))).toBe(true);
  });

  it("never returns another user's chunks or chunks without an owner", async () => {
    const result = await findUserChunks(userTwo);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("User two, private chunk.");
  });
});
