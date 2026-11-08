// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import mongoose from "mongoose";
import { startMongoServer } from "./mongoMemory.js";

// Real database, real routes, real parallel requests: only what is slow or unrelated is replaced.
const { current, extractTextFromBuffer } = vi.hoisted(() => ({
  current: { user: null },
  extractTextFromBuffer: vi.fn(),
}));

vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("../rag/embed.js", () => ({ embed: vi.fn() }));
vi.mock("../rag/embedMissing.js", () => ({ scheduleEmbeddingRetry: vi.fn() }));
vi.mock("../textExtract.js", () => ({ extractTextFromBuffer }));
// Rebuilding chunks needs transactions, which a standalone test server does not have.
vi.mock("../rag/syncChunks.js", async (importOriginal) => ({
  ...(await importOriginal()),
  syncDocumentChunks: vi.fn(),
}));
// This file sends more requests than the upload limit allows, on purpose.
vi.mock("express-rate-limit", () => ({ default: () => (_req, _res, next) => next() }));
vi.mock("../auth.js", () => {
  const authenticate = (req, _res, next) => {
    req.user = current.user;
    next();
  };
  return { getCurrentUser: authenticate, requireAdmin: authenticate, requireEditor: authenticate };
});

import { User, Document } from "../models.js";
import { DEMO_LIMITS } from "../access.js";
import { createDemoWorkspace, enforceLiveWorkspaceCap } from "../demo.js";
import { demoStorageCost } from "../demoQuota.js";
import documentsRouter from "../routes/documents.js";

const MB = 1024 * 1024;
const NO_TEXT = "";

let mongo;
let server;
let baseUrl;

beforeAll(async () => {
  mongo = await startMongoServer();
  await mongoose.connect(mongo.getUri());
  const app = express();
  app.use(express.json());
  app.use("/api/documents", documentsRouter);
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/documents`;
}, 120_000);

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Document.deleteMany({})]);
  await mongoose.connection.db.collection("attachments.files").deleteMany({});
  await mongoose.connection.db.collection("attachments.chunks").deleteMany({});
  extractTextFromBuffer.mockReset();
  extractTextFromBuffer.mockResolvedValue(NO_TEXT);
});

const newUser = (fields = {}) => User.create({
  email: `user-${new mongoose.Types.ObjectId()}@demo.invalid`,
  role: "demo",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  ...fields,
});

const newDoc = (user) => Document.create({ title: "T", category: "C", content: "Body.", ownerId: user._id, demo: true });

function uploadTo(docId, bytes) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes).fill(0x61)], { type: "text/plain" }), "notes.txt");
  return fetch(`${baseUrl}/${docId}/attachments`, { method: "POST", body: form });
}

const storedFiles = () => mongoose.connection.db.collection("attachments.files").countDocuments();
const storageUsed = async () => (await User.findById(current.user._id)).demoStorageBytes ?? 0;

describe("demo file size", () => {
  it("refuses a file over the demo limit, naming it", async () => {
    current.user = await newUser();
    const doc = await newDoc(current.user);

    const res = await uploadTo(doc._id, DEMO_LIMITS.uploadBytes + 1);

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ detail: "File is too large. The maximum size is 2MB." });
    expect(await storedFiles()).toBe(0);
  });

  it("accepts a file at the demo limit", async () => {
    current.user = await newUser();
    const doc = await newDoc(current.user);
    expect((await uploadTo(doc._id, DEMO_LIMITS.uploadBytes)).status).toBe(200);
  });

  it("does not apply the demo limit to an admin", async () => {
    current.user = await newUser({ role: "admin", expiresAt: null });
    const doc = await Document.create({ title: "T", category: "C", content: "Body.", ownerId: current.user._id });
    expect((await uploadTo(doc._id, 3 * MB)).status).toBe(200);
    expect(current.user.demoStorageBytes).toBeUndefined();
  });

  it("keeps at most a document's worth of text from a file", async () => {
    current.user = await newUser();
    const doc = await newDoc(current.user);
    extractTextFromBuffer.mockResolvedValue("x".repeat(DEMO_LIMITS.contentLength + 500));

    const attachment = await (await uploadTo(doc._id, 10)).json();

    expect(attachment.extractedText).toHaveLength(DEMO_LIMITS.contentLength);
    expect(attachment.fileSize).toBe(10);
  });
});

describe("demo storage quota", () => {
  it("refuses a file that would go over the quota, and stores nothing", async () => {
    current.user = await newUser({ demoStorageBytes: DEMO_LIMITS.storageBytes - 10 });
    const doc = await newDoc(current.user);

    const res = await uploadTo(doc._id, 11);

    expect(res.status).toBe(403);
    expect((await res.json()).detail).toBe("Demo workspaces are limited to 5MB of uploaded files. Remove a file and try again.");
    expect(await storedFiles()).toBe(0);
    expect(await storageUsed()).toBe(DEMO_LIMITS.storageBytes - 10);
  });

  it("counts the text of a file, not only its size", async () => {
    current.user = await newUser();
    const doc = await newDoc(current.user);
    extractTextFromBuffer.mockResolvedValue("x".repeat(1000));

    await uploadTo(doc._id, 10);

    expect(await storageUsed()).toBe(demoStorageCost(10, "x".repeat(1000)));
    expect(await storageUsed()).toBe(10 + 1000 * 12);
  });

  it("holds under parallel uploads to different documents", async () => {
    current.user = await newUser();
    const docs = await Promise.all(Array.from({ length: 8 }, () => newDoc(current.user)));

    const responses = await Promise.all(docs.map((doc) => uploadTo(doc._id, DEMO_LIMITS.uploadBytes)));

    const stored = responses.filter((r) => r.status === 200).length;
    expect(stored).toBe(2); // Two 2 MB files fit in 5 MB, and a third does not.
    expect(await storedFiles()).toBe(stored);
    expect(await storageUsed()).toBe(stored * DEMO_LIMITS.uploadBytes);
  });

  it("gives storage back when an attachment is deleted", async () => {
    current.user = await newUser();
    const doc = await newDoc(current.user);
    const attachment = await (await uploadTo(doc._id, 100)).json();
    expect(await storageUsed()).toBe(100);

    await fetch(`${baseUrl}/${doc._id}/attachments/${attachment._id}`, { method: "DELETE" });

    expect(await storageUsed()).toBe(0);
  });

  it("gives storage back when a document is deleted", async () => {
    current.user = await newUser({ demoDocuments: 1 });
    const doc = await newDoc(current.user);
    await uploadTo(doc._id, 100);

    await fetch(`${baseUrl}/${doc._id}`, { method: "DELETE" });

    expect(await storageUsed()).toBe(0);
    expect(await storedFiles()).toBe(0);
  });

  it("gives storage back when an upload loses the race for the document's attachment slot", async () => {
    current.user = await newUser();
    const doc = await newDoc(current.user);

    const responses = await Promise.all(Array.from({ length: 5 }, () => uploadTo(doc._id, 100)));

    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await storageUsed()).toBe(100);
    expect(await storedFiles()).toBe(1);
  });

  it("gives storage back when saving the attachment fails", async () => {
    current.user = await newUser();
    const doc = await newDoc(current.user);
    const save = vi.spyOn(Document, "findOneAndUpdate").mockRejectedValueOnce(new Error("write failed"));

    expect((await uploadTo(doc._id, 100)).status).toBe(500);
    save.mockRestore();

    expect(await storageUsed()).toBe(0);
    expect(await storedFiles()).toBe(0);
  });
});

describe("live demo workspace cap", () => {
  const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000);

  // The cap is full of workspaces, the first of them the least recently active.
  async function fillCap() {
    const users = await User.insertMany(Array.from({ length: DEMO_LIMITS.liveWorkspaces }, (_, i) => ({
      email: `full-${i}@demo.invalid`,
      role: "demo",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      lastActiveAt: minutesAgo(DEMO_LIMITS.liveWorkspaces - i),
    })));
    return users;
  }

  it("removes the least recently active workspace and everything in it, not the oldest", async () => {
    const users = await fillCap();
    const [idle, active] = users;
    // The first created is active again, so the next one is now the least active.
    await User.updateOne({ _id: idle._id }, { lastActiveAt: new Date() });
    await newDoc(active);
    await newDoc(idle);

    const created = await createDemoWorkspace();

    expect(await User.countDocuments({ role: "demo" })).toBe(DEMO_LIMITS.liveWorkspaces);
    expect(await User.findById(created._id)).not.toBeNull();
    expect(await User.findById(idle._id)).not.toBeNull();
    expect(await User.findById(active._id)).toBeNull();
    expect(await Document.countDocuments({ ownerId: active._id })).toBe(0);
    expect(await Document.countDocuments({ ownerId: idle._id })).toBe(1);
  });

  it("never refuses a new visitor, and settles at the cap under parallel creation", async () => {
    await fillCap();

    const created = await Promise.all(Array.from({ length: 5 }, () => createDemoWorkspace()));

    expect(created.every((user) => user.role === "demo")).toBe(true);
    expect(await User.countDocuments({ role: "demo" })).toBeLessThanOrEqual(DEMO_LIMITS.liveWorkspaces);
  });

  it("removes nothing below the cap", async () => {
    await newUser({ lastActiveAt: minutesAgo(600) });
    expect(await enforceLiveWorkspaceCap(new mongoose.Types.ObjectId())).toBe(0);
    expect(await User.countDocuments({ role: "demo" })).toBe(1);
  });

  it("removes a workspace from before activity was recorded first", async () => {
    const users = await fillCap();
    const legacy = users[DEMO_LIMITS.liveWorkspaces - 1];
    await User.updateOne({ _id: legacy._id }, { $unset: { lastActiveAt: 1 } });

    await createDemoWorkspace();

    expect(await User.findById(legacy._id)).toBeNull();
  });

  it("never touches a real account", async () => {
    await fillCap();
    const admin = await newUser({ role: "admin", expiresAt: null, lastActiveAt: minutesAgo(100000) });

    await createDemoWorkspace();

    expect(await User.findById(admin._id)).not.toBeNull();
  });

  it("starts a workspace with its counters and activity set", async () => {
    const created = await createDemoWorkspace();
    expect(created.demoDocuments).toBe(await Document.countDocuments({ ownerId: created._id }));
    expect(created.lastActiveAt).toBeInstanceOf(Date);
  });
});
