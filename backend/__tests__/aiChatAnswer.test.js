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
import aiRouter, {
  EMPTY_ANSWER_DETAIL, TOO_LONG_ANSWER_DETAIL, AI_BUSY_DETAIL, SHORTENED_NOTE, isNoInfoAnswer, cutToLastSentence,
} from "../ai.js";
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

  it("returns an answer cut off inside a sentence up to its last complete sentence, with a note", async () => {
    const warn = vi.spyOn(logger, "warn");
    const content = "Ask the team lead [c1]. Then wait for the appro";
    modelAnswers(content, { finish_reason: "length" });

    const res = await chat();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.answer).toBe(`Ask the team lead [c1].\n\n${SHORTENED_NOTE}`);
    expect(body.citations.map((c) => c.id)).toEqual(["c1"]);
    expect(warn).toHaveBeenCalledWith("Model answer was cut off by the token limit", { length: content.length, finishReason: "length" });
    const [log] = await RetrievalLog.find().lean();
    expect(log.noInfo).toBe(false);
    expect(body.answerId).toBe(String(log._id));
  });

  it("drops a citation marker cut off at the end, so it gives no source", async () => {
    modelAnswers("Ask the team lead. Then check [c", { finish_reason: "length" });

    const body = await (await chat()).json();

    expect(body.answer).toBe(`Ask the team lead.\n\n${SHORTENED_NOTE}`);
    expect(body.citations).toEqual([]);
  });

  it("returns 502 when an answer cut off at the limit has no complete sentence", async () => {
    modelAnswers("Ask the team le", { finish_reason: "length" });

    const res = await chat();

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ detail: TOO_LONG_ANSWER_DETAIL });
    expect(await RetrievalLog.countDocuments()).toBe(0);
  });

  it.each([
    ["the provider's retry-after, rounded up", { "retry-after": "61.2" }, "62"],
    ["at most an hour", { "retry-after": "86400" }, "3600"],
    ["5 minutes when the provider sends none", {}, "300"],
  ])("returns 503 with a plain message when the provider rate limits, retrying after %s", async (_label, headers, retryAfter) => {
    const warn = vi.spyOn(logger, "warn");
    const providerMessage = "429 Rate limit reached for model in organization org_x on tokens per day (TPD)";
    groqCreate.mockRejectedValueOnce(Object.assign(new Error(providerMessage), { status: 429, headers }));

    const res = await chat();

    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe(retryAfter);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ detail: AI_BUSY_DETAIL });
    expect(text).not.toMatch(/TPD|org_x|tokens per day/);
    expect(warn).toHaveBeenCalledWith("AI service rate limited", { status: 429, retryAfter: Number(retryAfter), message: providerMessage });
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

describe("cutToLastSentence", () => {
  it.each([
    ["inside a sentence", "Ask the team lead [c1]. Then wait for the appro", "Ask the team lead [c1]."],
    ["inside bold", "**Ask the team lead [c1]. Then wa", "Ask the team lead [c1]."],
    ["inside bold that opened after the last sentence", "Ask the team lead [c1]. **Then wa", "Ask the team lead [c1]."],
    ["inside italic", "*Ask the team lead.* Then *wait for", "*Ask the team lead.*"],
    ["inside a citation marker", "Ask the team lead [c1]. Then wait [c", "Ask the team lead [c1]."],
    ["after a citation that follows the period", "Ask the team lead. [c1] Then wa", "Ask the team lead. [c1]"],
    ["inside a list item", "Steps:\n- Ask the team lead [c1]\n- Wait for appro", "Steps:\n- Ask the team lead [c1]"],
    ["after an empty numbered item", "Steps:\n1. Ask the team lead.\n2.", "Steps:\n1. Ask the team lead."],
    ["after an empty bullet", "Steps:\n* Ask the team lead.\n* ", "Steps:\n* Ask the team lead."],
    ["after a line that introduces a list", "Ask the team lead.\n**Next steps:**\n- Wa", "Ask the team lead."],
    ["after a question", "Who approves? The team le", "Who approves?"],
  ])("cuts %s", (_label, text, expected) => {
    expect(cutToLastSentence(text)).toBe(expected);
  });

  it.each([
    ["no sentence end", "Ask the team le"],
    ["only a line that introduces a list", "Steps:\n- Ask the te"],
    ["only an unfinished citation", "[c"],
  ])("returns an empty string when there is %s", (_label, text) => {
    expect(cutToLastSentence(text)).toBe("");
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

  it("offers the default questions as proper questions when none were saved", async () => {
    vi.spyOn(AIConfig, "findById").mockResolvedValueOnce(null);

    const res = await requestAs(admin, "GET", "/api/ai/suggestions");

    expect(res.status).toBe(200);
    expect((await res.json()).questions).toEqual([
      "What security issues are related to this topic?",
      "Summarize the key decisions and their rationale",
      "What are the most common mistakes people make in this area?",
      "What are the most important rules from this topic?",
    ]);
  });

  it("returns 500 when saving the example questions fails", async () => {
    vi.spyOn(AIConfig, "findByIdAndUpdate").mockRejectedValueOnce(new Error("db down"));

    const res = await requestAs(admin, "PATCH", "/api/ai/suggestions", { questions: ["What is new?"] });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ detail: "Could not save the questions. Please try again later." });
  });
});
