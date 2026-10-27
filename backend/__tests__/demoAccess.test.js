// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

process.env.GROQ_API_KEY = "test-key";

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
const USERS = {
  "demo@demo.invalid": { _id: "demo-1", email: "demo@demo.invalid", role: "demo", expiresAt: FUTURE, favorites: [] },
  "expired@demo.invalid": { _id: "demo-9", email: "expired@demo.invalid", role: "demo", expiresAt: new Date(0), favorites: [] },
  "admin@corp.example": { _id: "admin-1", email: "admin@corp.example", role: "admin", favorites: [] },
};
const DOCS = {
  "own-1": { _id: "own-1", ownerId: "demo-1", demo: true, title: "Own", content: "Own text.",
    attachments: [{ fileName: "own.txt", extractedText: "OWN ATTACHMENT TEXT" }] },
  "real-1": { _id: "real-1", ownerId: "admin-1", demo: false, title: "Real", content: "Real text.",
    attachments: [{ fileName: "real.pdf", extractedText: "REAL ATTACHMENT TEXT" }] },
  "other-1": { _id: "other-1", ownerId: "demo-2", demo: true, title: "Other", content: "Other text.", attachments: [] },
};

// Resolves like a Mongoose query, with .lean() for the routes that use it.
const query = (value) => Object.assign(Promise.resolve(value), { lean: async () => value });

const { User, Document, groqCreate } = vi.hoisted(() => ({
  User: { findOne: vi.fn(), find: vi.fn(), findByIdAndUpdate: vi.fn() },
  Document: {
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
    create: vi.fn(),
    insertMany: vi.fn(),
    deleteMany: vi.fn(),
    db: { transaction: vi.fn((fn) => fn("tx")) },
  },
  groqCreate: vi.fn(),
}));
vi.mock("../models.js", () => ({ User, Document, AIConfig: {} }));
vi.mock("../rag/syncChunks.js", () => ({ syncDocumentChunks: vi.fn(), deleteDocumentChunks: vi.fn() }));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("groq-sdk", () => ({
  default: class {
    chat = { completions: { create: groqCreate } };
  },
}));
vi.mock("../demo.js", () => ({
  createDemoWorkspace: vi.fn(async () => USERS["demo@demo.invalid"]),
  DEMO_SAMPLE_USERS: [{ id: "sample-1", email: "dana.levi@northwind.example", role: "admin", status: "active" }],
}));

import authRouter from "../auth.js";
import aiRouter from "../ai.js";
import documentsRouter from "../routes/documents.js";
import usersRouter from "../routes/users.js";

let server;
let base;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  app.use(aiRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/users", usersRouter);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  vi.clearAllMocks();
  User.findOne.mockImplementation(async ({ email }) => USERS[email] ?? null);
  Document.findById.mockImplementation((id) => query(DOCS[id] ?? null));
  Document.find.mockImplementation(() => Object.assign(query([]), { sort: async () => [] }));
  groqCreate.mockResolvedValue({ choices: [{ message: { content: "ok" } }] });
});

function as(email) {
  const token = jwt.sign({ sub: email, role: USERS[email].role }, "dev-secret-change-me");
  return (path, init = {}) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Cookie: `access_token=${token}`, ...init.headers },
    });
}
const demo = as("demo@demo.invalid");
const admin = as("admin@corp.example");

describe("demo workspace isolation", () => {
  it("lists only the demo user's own documents", async () => {
    await demo("/api/documents");
    expect(Document.find).toHaveBeenCalledWith({ ownerId: "demo-1" });
  });

  it("lists only non-demo documents for regular users", async () => {
    await admin("/api/documents");
    expect(Document.find).toHaveBeenCalledWith({ demo: { $ne: true } });
  });

  it("lets a demo user open their own document but not anyone else's", async () => {
    expect((await demo("/api/documents/own-1")).status).toBe(200);
    expect((await demo("/api/documents/real-1")).status).toBe(404);
    expect((await demo("/api/documents/other-1")).status).toBe(404);
  });

  it("hides demo documents from regular users", async () => {
    expect((await admin("/api/documents/real-1")).status).toBe(200);
    expect((await admin("/api/documents/own-1")).status).toBe(404);
  });

  it("blocks a demo user from editing or deleting a document that is not theirs", async () => {
    const body = JSON.stringify({ title: "x", category: "y", content: "z" });
    expect((await demo("/api/documents/real-1", { method: "PUT", body })).status).toBe(404);
    expect((await demo("/api/documents/other-1", { method: "DELETE" })).status).toBe(404);
    expect(Document.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(Document.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it("creates documents in the demo user's own sandbox", async () => {
    Document.create.mockImplementation(async (d) => ({ _id: "new-1", ...d }));
    const res = await demo("/api/documents", {
      method: "POST",
      body: JSON.stringify({ title: "Mine", category: "Test", content: "Body." }),
    });
    expect(res.status).toBe(200);
    expect(Document.create).toHaveBeenCalledWith({
      title: "Mine", category: "Test", content: "Body.", ownerId: "demo-1", demo: true,
    });
  });

  it("replace-mode import by a demo user only replaces their own documents", async () => {
    Document.find.mockImplementation(async () => [{ _id: "own-1" }]);
    Document.insertMany.mockResolvedValue([]);
    const res = await demo("/api/documents/import-bulk", {
      method: "POST",
      body: JSON.stringify({ mode: "replace", documents: [{ title: "T", category: "C", content: "B" }] }),
    });
    expect(res.status).toBe(200);
    expect(Document.find).toHaveBeenCalledWith({ ownerId: "demo-1" }, "_id", { session: "tx" });
    expect(Document.deleteMany).toHaveBeenCalledWith({ _id: { $in: ["own-1"] } }, { session: "tx" });
  });
});

describe("demo users cannot change system-wide settings", () => {
  it("blocks user management and AI settings", async () => {
    expect((await demo("/api/users/x", { method: "PATCH", body: JSON.stringify({ role: "admin" }) })).status).toBe(403);
    expect((await demo("/api/users/x", { method: "DELETE" })).status).toBe(403);
    expect((await demo("/api/ai/prompt", { method: "PATCH", body: JSON.stringify({ prompt: "x" }) })).status).toBe(403);
    expect((await demo("/api/ai/suggestions", { method: "PATCH", body: JSON.stringify({ questions: [] }) })).status).toBe(403);
  });

  it("blocks password changes", async () => {
    const res = await demo("/api/auth/password", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword: "a", newPassword: "abcdef" }),
    });
    expect(res.status).toBe(403);
  });

  it("shows fictional users instead of real accounts", async () => {
    const res = await demo("/api/users");
    expect(res.status).toBe(200);
    expect((await res.json())[0].email).toBe("dana.levi@northwind.example");
    expect(User.find).not.toHaveBeenCalled();
  });
});

describe("demo sessions", () => {
  it("starts a demo workspace and signs the visitor in", async () => {
    const res = await fetch(`${base}/api/auth/demo`, { method: "POST" });
    expect(res.status).toBe(201);
    expect((await res.json()).user.role).toBe("demo");
    expect(res.headers.get("set-cookie")).toMatch(/access_token=/);
  });

  it("rejects an expired demo session", async () => {
    expect((await as("expired@demo.invalid")("/api/documents")).status).toBe(401);
  });
});
