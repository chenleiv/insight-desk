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
vi.mock("express-rate-limit", async (importOriginal) => {
  const { ipKeyGenerator } = await importOriginal();
  return { default: () => (_req, _res, next) => next(), ipKeyGenerator };
});

import { User, Document, Chunk, UsageCounter } from "../models.js";
import aiRouter, { AI_BUSY_DETAIL, EMPTY_ANSWER_DETAIL } from "../ai.js";
import { keyedHash } from "../auth.js";
import {
  DAILY_BUDGET_DETAIL, DAILY_QUESTION_LIMITS, DAILY_TOKEN_CEILINGS, DEMO_ADDRESS_LIMIT_DETAIL, DEMO_ADDRESS_QUESTION_LIMIT,
  DEMO_QUESTION_LIMIT_DETAIL, TOKENS_RESERVED_PER_QUESTION, VIEWER_QUESTION_LIMIT_DETAIL,
  addressQuestionsKey, tokensKey, userQuestionsKey,
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
  // So a test can pick the client address with X-Forwarded-For.
  app.set("trust proxy", 1);
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

// Each test gets its own address unless it asks for one, so only the address tests share one.
let nextAddress = 1;
const newAddress = () => `203.0.113.${nextAddress++ % 250}`;

function chatAs(user, message = "vacation", address = newAddress()) {
  return fetch(`${base}/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": address,
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

describe("daily question limits", () => {
  const newDemo = (n) => User.create({ email: `sandbox-${n}-${Date.now()}@demo.invalid`, role: "demo", expiresAt: new Date(Date.now() + 60_000) });
  const countOf = async (key) => (await UsageCounter.findById(key).lean())?.count ?? 0;
  const ask = async (user, times, address) => {
    const statuses = [];
    for (let i = 0; i < times; i++) statuses.push((await chatAs(user, "vacation", address)).status);
    return statuses;
  };

  it("stops a demo sandbox at its limit, with a plain message and no model call", async () => {
    const statuses = await ask(demo, DAILY_QUESTION_LIMITS.demo, "203.0.113.251");
    expect(statuses.every((s) => s === 200)).toBe(true);
    groqCreate.mockClear();

    const res = await chatAs(demo, "vacation", "203.0.113.251");

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ detail: DEMO_QUESTION_LIMIT_DETAIL, code: "daily_limit", retryAfter: expect.any(Number) });
    expect(res.headers.get("retry-after")).toBe(String(body.retryAfter));
    expect(groqCreate).not.toHaveBeenCalled();
  });

  it("counts per sandbox, and from any address", async () => {
    await UsageCounter.create({ _id: userQuestionsKey(demo), count: DAILY_QUESTION_LIMITS.demo, expiresAt: new Date(Date.now() + 60_000) });

    expect((await chatAs(demo)).status).toBe(429);
    expect((await chatAs(emptyDemo)).status).toBe(200);
  });

  it("does not let parallel questions pass the sandbox limit", async () => {
    const results = await Promise.all(Array.from({ length: 30 }, () => chatAs(demo, "vacation", "203.0.113.251")));

    expect(results.filter((r) => r.status === 200)).toHaveLength(DAILY_QUESTION_LIMITS.demo);
    expect(await countOf(userQuestionsKey(demo))).toBe(DAILY_QUESTION_LIMITS.demo);
  });

  it("stops new sandboxes from one address at the address limit, not other addresses", async () => {
    const address = "203.0.113.252";
    const [first, second, third] = await Promise.all([newDemo(1), newDemo(2), newDemo(3)]);
    await ask(first, DAILY_QUESTION_LIMITS.demo, address);
    await ask(second, DEMO_ADDRESS_QUESTION_LIMIT - DAILY_QUESTION_LIMITS.demo, address);

    const res = await chatAs(third, "vacation", address);

    expect(res.status).toBe(429);
    expect((await res.json()).detail).toBe(DEMO_ADDRESS_LIMIT_DETAIL);
    expect(await countOf(userQuestionsKey(third))).toBe(0);
    expect((await chatAs(third, "vacation", "203.0.113.253")).status).toBe(200);
  });

  const fillAddressLimit = (address) =>
    UsageCounter.create({ _id: addressQuestionsKey(address), count: DEMO_ADDRESS_QUESTION_LIMIT, expiresAt: new Date(Date.now() + 60_000) });

  it("counts IPv6 addresses in one /64 and one /56 under one address counter", async () => {
    expect((await chatAs(emptyDemo, "vacation", "2001:db8:2:2:aaaa::1")).status).toBe(200);
    expect((await chatAs(emptyDemo, "vacation", "2001:db8:2:2:bbbb::2")).status).toBe(200);
    expect((await chatAs(emptyDemo, "vacation", "2001:db8:2:ff::3")).status).toBe(200);

    expect(await countOf(addressQuestionsKey("2001:db8:2::"))).toBe(3);
  });

  it("stops a whole /56 at the address limit, not another /56", async () => {
    await fillAddressLimit("2001:db8:1:2::1");

    const res = await chatAs(emptyDemo, "vacation", "2001:db8:1:ff:aaaa::9");

    expect(res.status).toBe(429);
    expect((await res.json()).detail).toBe(DEMO_ADDRESS_LIMIT_DETAIL);
    expect((await chatAs(emptyDemo, "vacation", "2001:db8:1:100::1")).status).toBe(200);
  });

  it("counts an IPv4-mapped address as its IPv4 address", async () => {
    await fillAddressLimit("203.0.113.50");

    const res = await chatAs(emptyDemo, "vacation", "::ffff:203.0.113.50");

    expect(res.status).toBe(429);
    expect((await res.json()).detail).toBe(DEMO_ADDRESS_LIMIT_DETAIL);
  });

  it("keeps the counter of an IPv4 address as it was, so it does not start over", () => {
    expect(addressQuestionsKey("203.0.113.50")).toContain(keyedHash("203.0.113.50"));
  });

  it("still answers from an invalid address, which counts on its own", async () => {
    expect((await chatAs(emptyDemo, "vacation", "not-an-ip")).status).toBe(200);

    expect(await countOf(addressQuestionsKey("not-an-ip"))).toBe(1);
    expect(addressQuestionsKey(undefined)).toContain(keyedHash("undefined"));
  });

  it("gives a viewer a higher limit per account, with no address limit", async () => {
    const address = "203.0.113.254";
    await UsageCounter.create({ _id: addressQuestionsKey(address), count: DEMO_ADDRESS_QUESTION_LIMIT, expiresAt: new Date(Date.now() + 60_000) });
    await UsageCounter.create({ _id: userQuestionsKey(viewer), count: DAILY_QUESTION_LIMITS.viewer - 1, expiresAt: new Date(Date.now() + 60_000) });

    expect((await chatAs(viewer, "vacation", address)).status).toBe(200);

    const res = await chatAs(viewer, "vacation", address);
    expect(res.status).toBe(429);
    expect((await res.json()).detail).toBe(VIEWER_QUESTION_LIMIT_DETAIL);
  });

  it("sets no question limit for the admin", async () => {
    expect((await ask(admin, DAILY_QUESTION_LIMITS.viewer + 1)).every((s) => s === 200)).toBe(true);
    expect(await countOf(userQuestionsKey(admin))).toBe(0);
  });

  it("counts a question that needed no model call", async () => {
    expect((await chatAs(emptyDemo)).status).toBe(200);
    expect(await countOf(userQuestionsKey(emptyDemo))).toBe(1);
  });

  it("does not count a question the provider refused or failed to answer", async () => {
    const address = "203.0.113.251";
    groqCreate.mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }));
    expect((await chatAs(demo, "vacation", address)).status).toBe(503);
    groqCreate.mockRejectedValueOnce(new Error("Request timed out."));
    expect((await chatAs(demo, "vacation", address)).status).toBe(500);
    groqCreate.mockResolvedValueOnce({ choices: [{ message: { content: "" } }], usage: { total_tokens: 1024 } });
    const empty = await chatAs(demo, "vacation", address);
    expect(empty.status).toBe(502);
    expect((await empty.json()).detail).toBe(EMPTY_ANSWER_DETAIL);

    await vi.waitFor(async () => expect(await countOf(userQuestionsKey(demo))).toBe(0));
    expect(await countOf(addressQuestionsKey(address))).toBe(0);
    // The empty answer still used tokens, and the timeout may have.
    await expectTokensToday(TOKENS_RESERVED_PER_QUESTION + 1024);
  });

  it("gives the question back when the token ceiling refuses it", async () => {
    const address = "203.0.113.251";
    await setTokensToday(DAILY_TOKEN_CEILINGS.demo);

    expect((await chatAs(demo, "vacation", address)).status).toBe(503);

    expect(await countOf(userQuestionsKey(demo))).toBe(0);
    expect(await countOf(addressQuestionsKey(address))).toBe(0);
  });

  it("gives the question back when a counter cannot be written", async () => {
    const realUpdate = UsageCounter.updateOne.bind(UsageCounter);
    const failing = vi.spyOn(UsageCounter, "updateOne").mockImplementation((filter, ...rest) => {
      if (String(filter._id).startsWith("tokens:")) throw new Error("database is away");
      return realUpdate(filter, ...rest);
    });
    const address = "203.0.113.251";
    try {
      expect((await chatAs(demo, "vacation", address)).status).toBe(500);
    } finally {
      failing.mockRestore();
    }
    expect(await countOf(userQuestionsKey(demo))).toBe(0);
    expect(await countOf(addressQuestionsKey(address))).toBe(0);
  });

  it("never stores the client address", async () => {
    await chatAs(demo, "vacation", "203.0.113.251");

    const counters = await UsageCounter.find({}).lean();
    expect(counters.length).toBeGreaterThan(0);
    expect(JSON.stringify(counters)).not.toContain("203.0.113.251");
  });
});
