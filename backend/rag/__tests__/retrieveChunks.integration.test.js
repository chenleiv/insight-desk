// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.GROQ_API_KEY = "test-key";

const { groqCreate } = vi.hoisted(() => ({ groqCreate: vi.fn() }));
vi.mock("groq-sdk", () => ({
  default: class {
    chat = { completions: { create: groqCreate } };
  },
}));

import { User, Document, Chunk } from "../../models.js";
import { retrieveChunks, queryTokens } from "../retrieveChunks.js";
import aiRouter from "../../ai.js";

// Runs against a real in-memory MongoDB, so the access filters are exercised for real.
let mongo;
let server;
let base;
let demoOne;
let demoTwo;
let viewer;
let realDoc;
let demoOneDoc;
let demoTwoDoc;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  const future = new Date(Date.now() + 60 * 60 * 1000);
  [demoOne, demoTwo, viewer] = await User.create([
    { email: "demo-one@demo.invalid", role: "demo", expiresAt: future },
    { email: "demo-two@demo.invalid", role: "demo", expiresAt: future },
    { email: "viewer@corp.example", role: "viewer" },
  ]);
  const admin = new mongoose.Types.ObjectId();
  [realDoc, demoOneDoc, demoTwoDoc] = await Document.create([
    { title: "Vacation Policy", category: "HR", content: "x", ownerId: admin },
    { title: "Demo One Policy", category: "HR", content: "x", ownerId: demoOne._id, demo: true },
    { title: "Demo Two Policy", category: "HR", content: "x", ownerId: demoTwo._id, demo: true },
  ]);
  await Chunk.insertMany([
    { docId: realDoc._id, ownerId: admin, index: 0, text: "REAL: employees get 20 vacation days." },
    { docId: realDoc._id, ownerId: admin, index: 1, text: "REAL: מדיניות החופשה מאושרת על ידי המנהל." },
    { docId: demoOneDoc._id, ownerId: demoOne._id, index: 0, text: "DEMO ONE: vacation requests go to the team lead." },
    { docId: demoTwoDoc._id, ownerId: demoTwo._id, index: 0, text: "DEMO TWO: vacation is unlimited." },
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

beforeEach(() => {
  groqCreate.mockReset();
  groqCreate.mockResolvedValue({ choices: [{ message: { content: "ok" } }] });
});

const texts = (chunks) => chunks.map((c) => c.text.split(":")[0]);

describe("retrieveChunks", () => {
  it("gives a demo user only their own chunks", async () => {
    expect(texts(await retrieveChunks(demoOne, "vacation"))).toEqual(["DEMO ONE"]);
  });

  it("gives a regular user the real chunks and never demo chunks", async () => {
    // Both real chunks match through the document title.
    expect(texts(await retrieveChunks(viewer, "vacation"))).toEqual(["REAL", "REAL"]);
  });

  it("ignores selected ids of documents the user may not read", async () => {
    const ids = [String(realDoc._id), String(demoTwoDoc._id), "not-an-id"];
    expect(await retrieveChunks(demoOne, "vacation", ids)).toEqual([]);
  });

  it("returns the selected documents' chunks even without a keyword match", async () => {
    const result = await retrieveChunks(viewer, "summarize", [String(realDoc._id)]);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Vacation Policy");
  });

  it("matches Hebrew questions", async () => {
    const result = await retrieveChunks(viewer, "מה מדיניות החופשה?");
    expect(result[0].text).toContain("מדיניות החופשה");
  });

  it("falls back to the opening chunks when nothing matches, still within the user's documents", async () => {
    const result = await retrieveChunks(demoOne, "מה נוהל הבקשות?");
    expect(texts(result)).toEqual(["DEMO ONE"]);
  });

  it("refuses to run without an authenticated user", async () => {
    await expect(retrieveChunks(undefined, "vacation")).rejects.toThrow("An authenticated user is required");
  });
});

describe("queryTokens", () => {
  it("keeps words in any script and drops one-letter words and duplicates", () => {
    expect(queryTokens("What is a VPN? vpn מה זה")).toEqual(["what", "is", "vpn", "מה", "זה"]);
  });
});

describe("POST /api/ai/chat", () => {
  function chatAs(user, body) {
    const token = jwt.sign({ sub: user.email, role: user.role }, "dev-secret-change-me");
    return fetch(`${base}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `access_token=${token}` },
      body: JSON.stringify(body),
    });
  }
  // The answer is always the last model call; a keyword translation may come before it.
  const promptSent = () => groqCreate.mock.calls.at(-1)[0].messages[1].content;

  it("sends the model only chunks the signed-in user may read, whatever ids the request names", async () => {
    const res = await chatAs(demoOne, {
      message: "vacation",
      docIds: [String(demoOneDoc._id), String(demoTwoDoc._id), String(realDoc._id)],
    });

    expect(res.status).toBe(200);
    expect(promptSent()).toContain("DEMO ONE");
    expect(promptSent()).not.toContain("DEMO TWO");
    expect(promptSent()).not.toContain("REAL");
    expect((await res.json()).sources).toEqual([{ id: String(demoOneDoc._id), title: "Demo One Policy" }]);
  });

  it("searches all readable documents when nothing is selected", async () => {
    const res = await chatAs(viewer, { message: "vacation days" });

    expect(res.status).toBe(200);
    expect(promptSent()).toContain("REAL: employees get 20 vacation days.");
    expect(promptSent()).not.toContain("DEMO");
    // A matching question needs no keyword translation.
    expect(groqCreate).toHaveBeenCalledTimes(1);
  });

  it("translates a question with no keyword match and searches again", async () => {
    groqCreate.mockResolvedValueOnce({ choices: [{ message: { content: "vacation requests" } }] });

    const res = await chatAs(demoOne, { message: "לאן שולחים בקשות?" });

    expect(res.status).toBe(200);
    expect(groqCreate).toHaveBeenCalledTimes(2);
    expect(groqCreate.mock.calls[0][0].messages[1].content).toBe("לאן שולחים בקשות?");
    expect(promptSent()).toContain("DEMO ONE");
    expect(promptSent()).not.toContain("REAL");
  });

  it("still answers from the opening chunks when the translation fails", async () => {
    groqCreate.mockRejectedValueOnce(new Error("rate limited"));

    const res = await chatAs(demoOne, { message: "לאן שולחים בקשות?" });

    expect(res.status).toBe(200);
    expect(promptSent()).toContain("DEMO ONE");
  });
});
