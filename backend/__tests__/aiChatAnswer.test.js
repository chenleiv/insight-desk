// @vitest-environment node
// Kept apart from aiChat.test.js, which already uses up most of the chat rate limit.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
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

import { User, Document, Chunk, RetrievalLog, AIConfig } from "../models.js";
import aiRouter, { EMPTY_ANSWER_DETAIL, isNoInfoAnswer } from "../ai.js";
import { DEFAULT_PROMPT, NO_INFO_ANSWER, LEGACY_NO_INFO_ANSWERS, promptState } from "../prompts.js";
import { EMBEDDING_FORMAT_VERSION } from "../rag/embeddingModel.js";
import { logger } from "../logger.js";

// Runs against a real in-memory MongoDB and the real auth middleware.
let mongo;
let server;
let base;
let demo;
let admin;

beforeAll(async () => {
  mongo = await startMongoServer();
  await mongoose.connect(mongo.getUri());

  [demo, admin] = await User.create([
    { email: "demo@demo.invalid", role: "demo", expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    { email: "admin@corp.example", role: "admin" },
  ]);
  const doc = await Document.create({ title: "Demo Policy", category: "HR", content: "x", ownerId: demo._id, demo: true });
  await Chunk.create({ docId: doc._id, ownerId: demo._id, index: 0, text: "Vacation requests go to the team lead.", embedding: [1, 0, 0] });

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

beforeEach(async () => {
  groqCreate.mockReset();
  groqCreate.mockResolvedValue({ choices: [{ message: { content: "Ask the team lead [c1]." } }] });
  await RetrievalLog.deleteMany({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function requestAs(user, method, path, body) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: `access_token=${jwt.sign({ sub: user.email, role: user.role }, "dev-secret-change-me")}`,
    },
    body: JSON.stringify(body),
  });
}

const chat = (message = "vacation") => requestAs(demo, "POST", "/api/ai/chat", { message });
const modelAnswers = (content, extra = {}) =>
  groqCreate.mockResolvedValueOnce({ choices: [{ message: { content }, ...extra }] });

describe("POST /api/ai/chat answer handling", () => {
  it.each([
    ["the current wording", NO_INFO_ANSWER],
    ["the legacy prompt wording", LEGACY_NO_INFO_ANSWERS[0]],
    ["the legacy server wording", LEGACY_NO_INFO_ANSWERS[1]],
  ])("logs a model refusal in %s as a \"no information\" answer", async (_label, refusal) => {
    modelAnswers(refusal);

    const res = await chat();

    expect(res.status).toBe(200);
    expect((await res.json()).answer).toBe(refusal);
    const [log] = await RetrievalLog.find().lean();
    expect(log.noInfo).toBe(true);
  });

  it("logs a regular answer as not \"no information\", with the embedding format version", async () => {
    await chat();

    const [log] = await RetrievalLog.find().lean();
    expect(log.noInfo).toBe(false);
    expect(log.embeddingFormat).toBe(EMBEDDING_FORMAT_VERSION);
  });

  it("does not return a sources field", async () => {
    const body = await (await chat()).json();

    expect(Object.keys(body).sort()).toEqual(["answer", "answerId", "citations"]);
  });

  it.each([
    ["null", null],
    ["empty", ""],
    ["whitespace only", "  \n "],
    ["only an invented citation", "[c9]"],
  ])("returns 502 with a clear message, and logs a warning, when the model answer is %s", async (_label, content) => {
    const warn = vi.spyOn(logger, "warn");
    modelAnswers(content, { finish_reason: "length" });

    const res = await chat();

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ detail: EMPTY_ANSWER_DETAIL });
    expect(warn).toHaveBeenCalledWith("Model returned an empty answer", { finishReason: "length" });
    expect(await RetrievalLog.countDocuments()).toBe(0);
  });

  it("does not log a retrieval when the model call fails", async () => {
    groqCreate.mockRejectedValueOnce(new Error("upstream down"));

    expect((await chat()).status).toBe(500);
    expect(await RetrievalLog.countDocuments()).toBe(0);
  });

  it("asks for the exact \"not found\" sentence even when the stored prompt is replaced", async () => {
    const saved = promptState.prompt;
    promptState.prompt = "Custom admin prompt.";
    try {
      await chat();
    } finally {
      promptState.prompt = saved;
    }

    const system = groqCreate.mock.calls.at(-1)[0].messages[0].content;
    expect(system).toContain("Custom admin prompt.");
    expect(system).toContain(`"${NO_INFO_ANSWER}"`);
  });
});

describe("isNoInfoAnswer", () => {
  it.each([
    NO_INFO_ANSWER,
    ...LEGACY_NO_INFO_ANSWERS,
    `"${NO_INFO_ANSWER}"`,
    `  ${NO_INFO_ANSWER.toUpperCase()}\n`,
    "I couldn’t find this information in your documents",
    `${NO_INFO_ANSWER} [c1]`,
  ])("detects %j", (answer) => {
    expect(isNoInfoAnswer(answer)).toBe(true);
  });

  it.each([
    "Ask the team lead [c1].",
    `Vacation requests go to the team lead [c1]. ${NO_INFO_ANSWER}`,
    "I couldn't find",
    "",
  ])("does not detect %j", (answer) => {
    expect(isNoInfoAnswer(answer)).toBe(false);
  });
});

describe("DEFAULT_PROMPT", () => {
  it("asks for the shared \"not found\" sentence only", () => {
    expect(DEFAULT_PROMPT).toContain(`"${NO_INFO_ANSWER}"`);
    expect(DEFAULT_PROMPT).not.toContain("Please upload a relevant document");
  });
});

describe("PATCH routes for the AI config", () => {
  it("keeps the running prompt when saving it fails", async () => {
    const before = promptState.prompt;
    vi.spyOn(AIConfig, "findByIdAndUpdate").mockRejectedValueOnce(new Error("db down"));

    const res = await requestAs(admin, "PATCH", "/api/ai/prompt", { prompt: "New prompt" });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ detail: "Could not save the prompt. Please try again later." });
    expect(promptState.prompt).toBe(before);
  });

  it("saves a prompt, then runs it", async () => {
    const before = promptState.prompt;
    try {
      const res = await requestAs(admin, "PATCH", "/api/ai/prompt", { prompt: "  Saved prompt  " });

      expect(res.status).toBe(200);
      expect((await AIConfig.findById("ai").lean()).systemPrompt).toBe("Saved prompt");
      expect(promptState.prompt).toBe("Saved prompt");
    } finally {
      promptState.prompt = before;
    }
  });

  it("returns 500 when saving the example questions fails", async () => {
    vi.spyOn(AIConfig, "findByIdAndUpdate").mockRejectedValueOnce(new Error("db down"));

    const res = await requestAs(admin, "PATCH", "/api/ai/suggestions", { questions: ["What is new?"] });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ detail: "Could not save the questions. Please try again later." });
  });
});
