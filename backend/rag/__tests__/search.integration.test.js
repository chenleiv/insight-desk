// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startMongoServer } from "../../__tests__/mongoMemory.js";

// Fixed query vectors, so the test does not load the real model.
const { QUERY_VECTORS } = vi.hoisted(() => ({
  QUERY_VECTORS: { "time off": [1, 0, 0], "build pipeline": [0, 1, 0] },
}));
vi.mock("../embed.js", () => ({
  embed: vi.fn(async (text) => QUERY_VECTORS[text]),
}));

import { User, Document, Chunk } from "../../models.js";
import { search } from "../search.js";

// Runs against a real in-memory MongoDB, so the access filters are exercised for real.
let mongo;
let demoOne;
let demoTwo;
let viewer;

beforeAll(async () => {
  mongo = await startMongoServer();
  await mongoose.connect(mongo.getUri());

  const future = new Date(Date.now() + 60 * 60 * 1000);
  [demoOne, demoTwo, viewer] = await User.create([
    { email: "demo-one@demo.invalid", role: "demo", expiresAt: future },
    { email: "demo-two@demo.invalid", role: "demo", expiresAt: future },
    { email: "viewer@corp.example", role: "viewer" },
  ]);
  const admin = new mongoose.Types.ObjectId();
  const [realDoc, demoOneDoc, demoTwoDoc] = await Document.create([
    { title: "Vacation Policy", category: "HR", content: "x", ownerId: admin },
    { title: "Demo One Policy", category: "HR", content: "x", ownerId: demoOne._id, demo: true },
    { title: "Demo Two Policy", category: "HR", content: "x", ownerId: demoTwo._id, demo: true },
  ]);
  await Chunk.insertMany([
    { docId: realDoc._id, ownerId: admin, index: 0, text: "REAL: leave", embedding: [1, 0, 0] },
    { docId: demoOneDoc._id, ownerId: demoOne._id, index: 0, text: "DEMO ONE: leave", embedding: [0.9, 0.1, 0] },
    { docId: demoOneDoc._id, ownerId: demoOne._id, index: 1, text: "DEMO ONE: ci", embedding: [0.1, 0.9, 0] },
    { docId: demoOneDoc._id, ownerId: demoOne._id, index: 2, text: "DEMO ONE: no vector" },
    // Closest to every query, so it would win if the access filter leaked.
    { docId: demoTwoDoc._id, ownerId: demoTwo._id, index: 0, text: "DEMO TWO: leave", embedding: [1, 0, 0] },
  ]);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

const texts = (results) => results.map((r) => r.text);

describe("search", () => {
  it("gives a demo user only their own chunks, never another demo user's", async () => {
    const results = await search(demoOne, "time off");
    expect(texts(results)).toEqual(["DEMO ONE: leave", "DEMO ONE: ci"]);
    expect(texts(results)).not.toContain("DEMO TWO: leave");
  });

  it("gives a regular user the real chunks and never demo chunks", async () => {
    expect(texts(await search(viewer, "time off"))).toEqual(["REAL: leave"]);
  });

  it("ranks the closest chunk first and returns its title and score", async () => {
    const [top] = await search(demoOne, "build pipeline");
    expect(top).toMatchObject({ text: "DEMO ONE: ci", title: "Demo One Policy", index: 1 });
    expect(top.score).toBeGreaterThan(0.9);
  });

  it("skips chunks without an embedding", async () => {
    expect(texts(await search(demoOne, "time off"))).not.toContain("DEMO ONE: no vector");
  });

  it("returns at most k results", async () => {
    expect(await search(demoOne, "time off", 1)).toHaveLength(1);
  });

  it("refuses to run without an authenticated user", async () => {
    await expect(search(undefined, "time off")).rejects.toThrow("An authenticated user is required");
  });
});
