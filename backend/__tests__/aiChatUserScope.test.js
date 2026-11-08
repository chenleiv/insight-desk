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

import { User, Document, Chunk } from "../models.js";
import aiRouter from "../ai.js";

// The chat must search as the session's user, so nothing in a request can reach another
// user's documents. In its own file, since the chat rate limit is per module instance and
// aiChat.test.js already uses it up. Runs against a real in-memory MongoDB and the real
// auth middleware and search.
let mongo;
let server;
let base;
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
    { docId: realDoc._id, ownerId: admin, index: 0, text: "REAL: vacation is 20 days.", embedding: [1, 0, 0] },
    { docId: demoOneDoc._id, ownerId: demoOne._id, index: 0, text: "DEMO ONE: vacation goes to the lead.", embedding: [1, 0, 0] },
    { docId: demoTwoDoc._id, ownerId: demoTwo._id, index: 0, text: "DEMO TWO: vacation is unlimited.", embedding: [1, 0, 0] },
  ]);

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(aiRouter);
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(() => {
  groqCreate.mockReset();
  groqCreate.mockResolvedValue({ choices: [{ message: { content: "ok" } }] });
});

const tokenFor = (user, role = user.role) => jwt.sign({ sub: user.email, role }, "dev-secret-change-me");

function chat(token, { query = "", headers = {}, body = { message: "vacation" } } = {}) {
  return fetch(`${base}/api/ai/chat${query}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && { Cookie: `access_token=${token}` }),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const promptSent = () => groqCreate.mock.calls.at(-1)[0].messages[1].content;

function expectOnly(present, ...absent) {
  expect(promptSent()).toContain(present);
  for (const text of absent) expect(promptSent()).not.toContain(text);
}

describe("POST /api/ai/chat user scope", () => {
  it("answers the same question from each signed-in user's own documents", async () => {
    expect((await chat(tokenFor(demoOne))).status).toBe(200);
    expectOnly("DEMO ONE", "DEMO TWO", "REAL");

    expect((await chat(tokenFor(demoTwo))).status).toBe(200);
    expectOnly("DEMO TWO", "DEMO ONE", "REAL");

    expect((await chat(tokenFor(viewer))).status).toBe(200);
    expectOnly("REAL", "DEMO ONE", "DEMO TWO");
  });

  it("searches as the signed-in user, whatever user the query string names", async () => {
    const other = String(demoTwo._id);
    const query = `?userId=${other}&user=${other}&ownerId=${other}&email=${demoTwo.email}`;

    const res = await chat(tokenFor(demoOne), { query });

    expect(res.status).toBe(200);
    expectOnly("DEMO ONE", "DEMO TWO", "REAL");
  });

  it("searches as the signed-in user, whatever user a header names", async () => {
    const res = await chat(tokenFor(demoOne), {
      headers: { "X-User-Id": String(demoTwo._id), "X-User-Email": demoTwo.email },
    });

    expect(res.status).toBe(200);
    expectOnly("DEMO ONE", "DEMO TWO", "REAL");
  });

  it.each(["userId", "user", "ownerId", "email"])(
    "rejects a body that names another user in %s, without calling the model",
    async (field) => {
      const res = await chat(tokenFor(demoOne), {
        body: { message: "vacation", [field]: String(demoTwo._id) },
      });

      expect(res.status).toBe(400);
      expect(groqCreate).not.toHaveBeenCalled();
    },
  );

  it("takes the role from the database, not from the token", async () => {
    const res = await chat(tokenFor(demoOne, "viewer"));

    expect(res.status).toBe(200);
    expectOnly("DEMO ONE", "DEMO TWO", "REAL");
  });

  it("does not search or call the model without a session", async () => {
    const res = await chat(null);

    expect(res.status).toBe(401);
    expect(groqCreate).not.toHaveBeenCalled();
  });
});
