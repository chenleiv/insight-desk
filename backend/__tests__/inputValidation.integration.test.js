// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { startMongoServer } from "./mongoMemory.js";

process.env.GROQ_API_KEY = "test-key";

vi.mock("groq-sdk", () => ({ default: class {} }));
// A fixed vector, so the test does not load the real model.
vi.mock("../rag/embed.js", () => ({ embed: vi.fn(async () => [1, 0, 0]) }));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { User, AIConfig } from "../models.js";
import authRouter from "../auth.js";
import aiRouter from "../ai.js";
import documentsRouter from "../routes/documents.js";

// Runs against a real in-memory MongoDB and real routes, so a cast error would really be a 500.
const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const VALID_ID = "64b7f0c2a1b2c3d4e5f60718";
let mongo;
let server;
let base;
let adminCookie;

beforeAll(async () => {
  mongo = await startMongoServer();
  await mongoose.connect(mongo.getUri());
  const admin = await User.create({ email: "admin@example.com", role: "admin", displayName: "Admin" });
  adminCookie = `access_token=${jwt.sign({ sub: admin.email, role: "admin" }, SECRET)}`;
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  app.use(aiRouter);
  app.use("/api/documents", documentsRouter);
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

beforeEach(() => AIConfig.deleteMany({}));

const send = (method, path, body, cookie = adminCookie) =>
  fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined && { "Content-Type": "application/json" }),
      ...(cookie && { Cookie: cookie }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

const DOCUMENT_ROUTES = [
  ["GET", "/api/documents/:id"],
  ["GET", "/api/documents/:id/download?format=md"],
  ["PUT", "/api/documents/:id"],
  ["DELETE", "/api/documents/:id"],
  ["POST", "/api/documents/:id/toggle-favorite"],
  ["POST", "/api/documents/:id/attachments"],
  ["GET", `/api/documents/:id/attachments/${VALID_ID}/file`],
  ["DELETE", `/api/documents/:id/attachments/${VALID_ID}`],
];

describe("document ids in the URL", () => {
  it.each(DOCUMENT_ROUTES)("%s %s refuses a malformed document id with 400", async (method, path) => {
    const res = await send(method, path.replace(":id", "not-an-id"));

    expect(res.status).toBe(400);
    expect((await res.json()).errors[0].message).toBe("Invalid document id");
  });

  it.each(DOCUMENT_ROUTES)("%s %s asks for a session before looking at the id", async (method, path) => {
    expect((await send(method, path.replace(":id", "not-an-id"), undefined, null)).status).toBe(401);
  });

  it.each([
    ["GET", `/api/documents/${VALID_ID}/attachments/nope/file`],
    ["DELETE", `/api/documents/${VALID_ID}/attachments/nope`],
  ])("%s %s refuses a malformed attachment id with 400", async (method, path) => {
    const res = await send(method, path);

    expect(res.status).toBe(400);
    expect((await res.json()).errors[0].message).toBe("Invalid attachment id");
  });

  it("answers a well-formed id with no document with 404", async () => {
    expect((await send("GET", `/api/documents/${VALID_ID}`)).status).toBe(404);
  });

  it("leaves the fixed routes alone", async () => {
    expect((await send("GET", "/api/documents/export")).status).toBe(200);
  });
});

describe("PATCH /api/ai/prompt", () => {
  it.each([
    ["no body", {}],
    ["an empty prompt", { prompt: "   " }],
    ["a prompt that is not text", { prompt: 42 }],
    ["a prompt over the limit", { prompt: "x".repeat(20001) }],
    ["another field", { prompt: "ok", other: 1 }],
  ])("refuses %s with 400", async (_label, body) => {
    expect((await send("PATCH", "/api/ai/prompt", body)).status).toBe(400);
    expect(await AIConfig.countDocuments()).toBe(0);
  });

  it("saves a trimmed prompt at the limit", async () => {
    const res = await send("PATCH", "/api/ai/prompt", { prompt: `  ${"x".repeat(20000)}  ` });

    expect(res.status).toBe(200);
    expect((await res.json()).prompt).toHaveLength(20000);
  });
});

describe("PATCH /api/ai/suggestions", () => {
  it.each([
    ["no body", {}],
    ["questions that are not a list", { questions: "one" }],
    ["a question that is not text", { questions: [1] }],
    ["a question over the limit", { questions: ["x".repeat(301)] }],
    ["too many questions", { questions: Array(21).fill("q") }],
  ])("refuses %s with 400", async (_label, body) => {
    expect((await send("PATCH", "/api/ai/suggestions", body)).status).toBe(400);
  });

  it("saves trimmed questions and drops empty ones", async () => {
    const res = await send("PATCH", "/api/ai/suggestions", { questions: [" one ", "  ", "two"] });

    expect(res.status).toBe(200);
    expect((await res.json()).questions).toEqual(["one", "two"]);
  });
});

describe("PATCH /api/auth/profile", () => {
  it.each([
    ["a name that is not text", { displayName: 5 }],
    ["a name over the limit", { displayName: "x".repeat(81) }],
    ["a job title over the limit", { jobTitle: "x".repeat(81) }],
    ["another field", { role: "admin" }],
  ])("refuses %s with 400", async (_label, body) => {
    expect((await send("PATCH", "/api/auth/profile", body)).status).toBe(400);
    expect((await User.findOne({ email: "admin@example.com" })).role).toBe("admin");
  });

  it("saves trimmed values at the limit and leaves a missing field alone", async () => {
    const res = await send("PATCH", "/api/auth/profile", { jobTitle: `  ${"x".repeat(80)} ` });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ jobTitle: "x".repeat(80), displayName: "Admin" });
  });
});

describe("password routes", () => {
  it.each([
    ["no body", {}],
    ["a current password that is not text", { currentPassword: 1, newPassword: "x".repeat(12) }],
    ["a current password over the limit", { currentPassword: "x".repeat(1025), newPassword: "x".repeat(12) }],
  ])("PATCH /api/auth/password refuses %s with 400", async (_label, body) => {
    expect((await send("PATCH", "/api/auth/password", body)).status).toBe(400);
  });

  it.each([
    ["an email over the limit", { email: `${"x".repeat(250)}@example.com`, password: "long-enough" }],
    ["a password over the limit", { email: "a@example.com", password: "x".repeat(1025) }],
    ["fields that are not text", { email: 1, password: {} }],
  ])("POST /api/auth/login refuses %s with 400", async (_label, body) => {
    expect((await send("POST", "/api/auth/login", body, null)).status).toBe(400);
  });
});
