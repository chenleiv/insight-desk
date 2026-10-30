// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { startMongoServer } from "../../__tests__/mongoMemory.js";

// A fixed query vector, so the test does not load the real model.
vi.mock("../../rag/embed.js", () => ({ embed: vi.fn(async () => [1, 0, 0]) }));

import { User, Document, Chunk } from "../../models.js";
import searchRouter from "../search.js";

// Runs against a real in-memory MongoDB and the real auth middleware.
let mongo;
let server;
let base;
let demoOne;
let demoTwo;

beforeAll(async () => {
  mongo = await startMongoServer();
  await mongoose.connect(mongo.getUri());

  const future = new Date(Date.now() + 60 * 60 * 1000);
  [demoOne, demoTwo] = await User.create([
    { email: "demo-one@demo.invalid", role: "demo", expiresAt: future },
    { email: "demo-two@demo.invalid", role: "demo", expiresAt: future },
  ]);
  const [oneDoc, twoDoc] = await Document.create([
    { title: "Demo One Policy", category: "HR", content: "x", ownerId: demoOne._id, demo: true },
    { title: "Demo Two Policy", category: "HR", content: "x", ownerId: demoTwo._id, demo: true },
  ]);
  await Chunk.insertMany([
    { docId: oneDoc._id, ownerId: demoOne._id, index: 0, text: "DEMO ONE", embedding: [0.8, 0.2, 0] },
    { docId: twoDoc._id, ownerId: demoTwo._id, index: 0, text: "DEMO TWO", embedding: [1, 0, 0] },
  ]);

  const app = express();
  app.use(cookieParser());
  app.use(searchRouter);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

function searchAs(user, query) {
  const headers = {};
  if (user) {
    const token = jwt.sign({ sub: user.email, role: user.role }, "dev-secret-change-me");
    headers.Cookie = `access_token=${token}`;
  }
  return fetch(`${base}/api/search?${new URLSearchParams(query)}`, { headers });
}

describe("GET /api/search", () => {
  it("rejects a request without a session", async () => {
    expect((await searchAs(null, { q: "leave" })).status).toBe(401);
  });

  it("returns only the signed-in user's chunks, whatever user the query names", async () => {
    const res = await searchAs(demoOne, { q: "leave", userId: String(demoTwo._id) });

    expect(res.status).toBe(200);
    const { results } = await res.json();
    expect(results.map((r) => r.text)).toEqual(["DEMO ONE"]);
    expect(results[0]).toMatchObject({ title: "Demo One Policy", index: 0 });
  });

  it("rejects a missing, blank or too long query", async () => {
    expect((await searchAs(demoOne, {})).status).toBe(400);
    expect((await searchAs(demoOne, { q: "   " })).status).toBe(400);
    expect((await searchAs(demoOne, { q: "a".repeat(501) })).status).toBe(400);
  });

  it("rejects a k outside 1 to 20", async () => {
    expect((await searchAs(demoOne, { q: "leave", k: "0" })).status).toBe(400);
    expect((await searchAs(demoOne, { q: "leave", k: "21" })).status).toBe(400);
  });

  it("returns the validation message to the client without echoing the query", async () => {
    const res = await searchAs(demoOne, { q: "SECRET-INPUT ".repeat(40) });
    const body = await res.text();

    expect(res.status).toBe(400);
    expect(JSON.parse(body)).toEqual({
      detail: "Validation failed",
      errors: [{ path: ["q"], message: expect.stringMatching(/500/) }],
    });
    expect(body).not.toContain("SECRET-INPUT");
  });

  // Last, since it uses up the rate limit for this client.
  it("rate limits searches", async () => {
    const statuses = [];
    for (let i = 0; i < 21; i++) statuses.push((await searchAs(demoOne, { q: "leave" })).status);
    expect(statuses).toContain(429);
  });
});
