// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { startMongoServer } from "./mongoMemory.js";

process.env.GROQ_API_KEY = "test-key";

const { groqCreate } = vi.hoisted(() => ({ groqCreate: vi.fn() }));
vi.mock("groq-sdk", () => ({
  default: class {
    chat = { completions: { create: groqCreate } };
  },
}));
// A fixed query vector, so the test does not load the real model.
vi.mock("../rag/embed.js", () => ({ embed: vi.fn(async () => [1, 0, 0]) }));
// This file sends more questions than the per-minute limit allows, on purpose.
vi.mock("express-rate-limit", () => ({ default: () => (_req, _res, next) => next() }));

import { User, Document, Chunk, UsageCounter } from "../models.js";
import aiRouter, { AI_BUSY_DETAIL } from "../ai.js";
import {
  DAILY_BUDGET_DETAIL, DAILY_TOKEN_CEILINGS, TOKENS_RESERVED_PER_QUESTION, tokensKey,
} from "../usageBudget.js";

// Runs against a real in-memory MongoDB, the real auth middleware and the real search.
let mongo;
let server;
let base;
let demo;
let emptyDemo;
let viewer;
let admin;

beforeAll(async () => {
  mongo = await startMongoServer();
  await mongoose.connect(mongo.getUri());

  const future = new Date(Date.now() + 60 * 60 * 1000);
  [demo, emptyDemo, viewer, admin] = await User.create([
    { email: "demo@demo.invalid", role: "demo", expiresAt: future },
    { email: "empty@demo.invalid", role: "demo", expiresAt: future },
    { email: "viewer@corp.example", role: "viewer" },
    { email: "admin@corp.example", role: "admin" },
  ]);
  const [demoDoc, sharedDoc] = await Document.create([
    { title: "Demo Policy", category: "HR", content: "x", ownerId: demo._id, demo: true },
    { title: "Shared Policy", category: "HR", content: "x" },
  ]);
  await Chunk.insertMany([
    { docId: demoDoc._id, ownerId: demo._id, index: 0, text: "Ask the team lead.", embedding: [1, 0, 0] },
    { docId: sharedDoc._id, index: 0, text: "Ask the team lead.", embedding: [1, 0, 0] },
  ]);

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(aiRouter);
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

const answered = (totalTokens) => ({
  choices: [{ message: { content: "Ask the team lead [c1]." } }],
  usage: { total_tokens: totalTokens },
});

beforeEach(async () => {
  groqCreate.mockReset();
  groqCreate.mockResolvedValue(answered(1000));
  await UsageCounter.deleteMany({});
});

function chatAs(user, message = "vacation") {
  return fetch(`${base}/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `access_token=${jwt.sign({ sub: user.email, role: user.role }, "dev-secret-change-me")}`,
    },
    body: JSON.stringify({ message }),
  });
}

const tokensToday = async () => (await UsageCounter.findById(tokensKey()).lean())?.count ?? 0;
const setTokensToday = (count) => UsageCounter.create({ _id: tokensKey(), count, expiresAt: new Date(Date.now() + 60_000) });
// A question settles right after its response is sent.
const expectTokensToday = (count) => vi.waitFor(async () => expect(await tokensToday()).toBe(count));

describe("global daily token ceiling", () => {
  it("refuses a demo user at the ceiling with a plain message and no model call", async () => {
    await setTokensToday(DAILY_TOKEN_CEILINGS.demo - TOKENS_RESERVED_PER_QUESTION + 1);

    const res = await chatAs(demo);

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ detail: DAILY_BUDGET_DETAIL, code: "daily_limit", retryAfter: expect.any(Number) });
    expect(res.headers.get("retry-after")).toBe(String(body.retryAfter));
    expect(groqCreate).not.toHaveBeenCalled();
  });

  it("sends a Retry-After that ends at the next UTC midnight", async () => {
    await setTokensToday(DAILY_TOKEN_CEILINGS.demo);

    const before = Date.now();
    const res = await chatAs(demo);

    const now = new Date(before);
    const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    const retryAfter = Number(res.headers.get("retry-after"));
    expect(Math.abs(before + retryAfter * 1000 - midnight)).toBeLessThan(5000);
  });

  it("still answers a viewer past the demo ceiling, up to the viewer ceiling", async () => {
    await setTokensToday(DAILY_TOKEN_CEILINGS.demo);
    expect((await chatAs(demo)).status).toBe(503);
    expect((await chatAs(viewer)).status).toBe(200);

    await UsageCounter.updateOne({ _id: tokensKey() }, { count: DAILY_TOKEN_CEILINGS.viewer });
    expect((await chatAs(viewer)).status).toBe(503);
  });

  it("does not let parallel questions pass the ceiling", async () => {
    await setTokensToday(DAILY_TOKEN_CEILINGS.demo - 2 * TOKENS_RESERVED_PER_QUESTION);
    groqCreate.mockResolvedValue(answered(TOKENS_RESERVED_PER_QUESTION));

    const results = await Promise.all(Array.from({ length: 10 }, () => chatAs(demo)));

    expect(results.filter((r) => r.status === 200)).toHaveLength(2);
    expect(results.filter((r) => r.status === 503)).toHaveLength(8);
    expect(groqCreate).toHaveBeenCalledTimes(2);
    await expectTokensToday(DAILY_TOKEN_CEILINGS.demo);
  });
});

describe("admin", () => {
  it("is answered above every ceiling, and the tokens still count", async () => {
    await setTokensToday(190_000);

    expect((await chatAs(admin)).status).toBe(200);

    expect(groqCreate).toHaveBeenCalledTimes(1);
    await expectTokensToday(191_000);
  });

  it("holds no reservation, so visitors keep their share during an admin's question", async () => {
    await setTokensToday(DAILY_TOKEN_CEILINGS.demo - TOKENS_RESERVED_PER_QUESTION);
    let finishAdmin;
    groqCreate.mockImplementationOnce(() => new Promise((resolve) => {
      finishAdmin = () => resolve(answered(1000));
    }));

    const adminQuestion = chatAs(admin);
    await vi.waitFor(() => expect(groqCreate).toHaveBeenCalledTimes(1));
    expect((await chatAs(demo)).status).toBe(200);

    finishAdmin();
    expect((await adminQuestion).status).toBe(200);
  });

  it("is answered even when the counters cannot be written", async () => {
    const failing = vi.spyOn(UsageCounter, "updateOne").mockRejectedValue(new Error("database is away"));
    try {
      const res = await chatAs(admin);
      expect(res.status).toBe(200);
      expect((await res.json()).answer).toContain("Ask the team lead");
    } finally {
      failing.mockRestore();
    }
  });

  it("counts nothing for a call the provider refused", async () => {
    groqCreate.mockRejectedValue(Object.assign(new Error("rate limited"), { status: 429 }));
    expect((await chatAs(admin)).status).toBe(503);
    await expectTokensToday(0);
  });
});

describe("settling a question against the provider's usage", () => {
  it("replaces the reservation with the tokens the provider reported", async () => {
    groqCreate.mockResolvedValue(answered(1234));
    expect((await chatAs(demo)).status).toBe(200);
    await expectTokensToday(1234);
  });

  it("counts more than the reservation when the provider reports more", async () => {
    groqCreate.mockResolvedValue(answered(TOKENS_RESERVED_PER_QUESTION + 500));
    expect((await chatAs(demo)).status).toBe(200);
    await expectTokensToday(TOKENS_RESERVED_PER_QUESTION + 500);
  });

  it("counts both model calls of a question in another language", async () => {
    groqCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: "vacation" } }], usage: { total_tokens: 90 } })
      .mockResolvedValueOnce(answered(1000));

    expect((await chatAs(demo, "\u05D7\u05D5\u05E4\u05E9\u05D4")).status).toBe(200);

    expect(groqCreate).toHaveBeenCalledTimes(2);
    await expectTokensToday(1090);
  });

  it("gives the whole reservation back when no model call was needed", async () => {
    const res = await chatAs(emptyDemo);
    expect(res.status).toBe(200);
    expect(groqCreate).not.toHaveBeenCalled();
    await expectTokensToday(0);
  });

  it("gives the reservation back when the provider refuses the call", async () => {
    groqCreate.mockRejectedValue(Object.assign(new Error("rate limited"), { status: 429 }));

    const res = await chatAs(demo);

    expect(res.status).toBe(503);
    expect((await res.json()).detail).toBe(AI_BUSY_DETAIL);
    await expectTokensToday(0);
  });

  it("keeps the reservation when a call fails without a status, as it may have used tokens", async () => {
    groqCreate.mockRejectedValue(new Error("Request timed out."));
    expect((await chatAs(demo)).status).toBe(500);
    await expectTokensToday(TOKENS_RESERVED_PER_QUESTION);
  });

  it("keeps the reservation when the provider reports no usage", async () => {
    groqCreate.mockResolvedValue({ choices: [{ message: { content: "Ask the team lead [c1]." } }] });
    expect((await chatAs(demo)).status).toBe(200);
    await expectTokensToday(TOKENS_RESERVED_PER_QUESTION);
  });
});
