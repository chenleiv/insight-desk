// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { startMongoServer } from "./mongoMemory.js";
import { UsageCounter } from "../models.js";
import { takeUnits, adjustUnits } from "../usageBudget.js";

// Runs against a real in-memory MongoDB, since the limits rest on its atomic updates.
let mongo;

const countOf = async (key) => (await UsageCounter.findById(key).lean())?.count;

beforeAll(async () => {
  mongo = await startMongoServer();
  await mongoose.connect(mongo.getUri());
  await UsageCounter.init();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  await UsageCounter.deleteMany({});
});

describe("usage counters", () => {
  it("takes units up to the limit and refuses what would go over it", async () => {
    expect(await takeUnits("k", 3, 5)).toBe(true);
    expect(await takeUnits("k", 2, 5)).toBe(true);
    expect(await takeUnits("k", 1, 5)).toBe(false);
    expect(await countOf("k")).toBe(5);
  });

  it("does not go over the limit under parallel requests on a new counter", async () => {
    const results = await Promise.all(Array.from({ length: 40 }, () => takeUnits("k", 1, 15)));
    expect(results.filter(Boolean)).toHaveLength(15);
    expect(await countOf("k")).toBe(15);
  });

  it("adjusts in both directions, creating the counter if needed", async () => {
    await adjustUnits("k", 7);
    await adjustUnits("k", -3);
    expect(await countOf("k")).toBe(4);
  });

  it("removes old counters with a TTL index and sets when they expire", async () => {
    await takeUnits("taken", 1, 5);
    await adjustUnits("adjusted", 1);

    const indexes = await UsageCounter.collection.indexes();
    expect(indexes.find((i) => i.key.expiresAt)?.expireAfterSeconds).toBe(0);
    for (const key of ["taken", "adjusted"]) {
      const { expiresAt } = await UsageCounter.findById(key).lean();
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    }
  });

  it("keeps its counts across a reconnect, as after a server restart", async () => {
    await takeUnits("k", 5, 5);
    await mongoose.disconnect();
    await mongoose.connect(mongo.getUri());

    expect(await takeUnits("k", 1, 5)).toBe(false);
    expect(await countOf("k")).toBe(5);
  });
});
