// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import mongoose from "mongoose";
import { startMongoServer } from "./mongoMemory.js";

// Real database, real routes, real parallel requests: only what is slow or unrelated is replaced.
const { current } = vi.hoisted(() => ({ current: { user: null } }));

vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("../rag/syncChunks.js", () => ({ syncDocumentChunks: vi.fn(), deleteDocumentChunks: vi.fn() }));
vi.mock("../rag/embed.js", () => ({ embed: vi.fn() }));
vi.mock("../rag/embedMissing.js", () => ({ scheduleEmbeddingRetry: vi.fn() }));
vi.mock("../textExtract.js", () => ({ extractTextFromBuffer: vi.fn(async () => "Text.") }));
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
import documentsRouter from "../routes/documents.js";

const PARALLEL = 10;

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
    server = app.listen(0, resolve);
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
});

async function demoUser(existingDocuments = 0) {
  current.user = await User.create({
    email: `demo-${new mongoose.Types.ObjectId()}@demo.invalid`,
    role: "demo",
    demoDocuments: existingDocuments,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const docs = Array.from({ length: existingDocuments }, (_, i) => ({
    title: `Doc ${i}`, category: "C", content: "Body.", ownerId: current.user._id, demo: true,
  }));
  return docs.length ? Document.insertMany(docs) : [];
}

const createDocument = (i) => fetch(baseUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: `New ${i}`, category: "C", content: "Body." }),
});

function uploadTo(docId, text = "hello") {
  const form = new FormData();
  form.append("file", new Blob([text], { type: "text/plain" }), "notes.txt");
  return fetch(`${baseUrl}/${docId}/attachments`, { method: "POST", body: form });
}

const inParallel = (count, request) => Promise.all(Array.from({ length: count }, (_, i) => request(i)));
const statuses = (responses) => responses.map((r) => r.status).sort();
const storedFiles = () => mongoose.connection.db.collection("attachments.files").countDocuments();

describe("demo limits under parallel requests", () => {
  it("never creates more documents than the limit", async () => {
    await demoUser(DEMO_LIMITS.documents - 2);

    const responses = await inParallel(PARALLEL, createDocument);

    expect(await Document.countDocuments({ ownerId: current.user._id })).toBe(DEMO_LIMITS.documents);
    expect(statuses(responses)).toEqual([200, 200, ...Array(PARALLEL - 2).fill(403)]);
  });

  it("frees a document slot when a document is deleted", async () => {
    const [existing] = await demoUser(DEMO_LIMITS.documents);
    expect((await createDocument(0)).status).toBe(403);

    expect((await fetch(`${baseUrl}/${existing._id}`, { method: "DELETE" })).status).toBe(204);

    expect((await createDocument(1)).status).toBe(200);
    expect((await createDocument(2)).status).toBe(403);
  });

  it("frees only one slot when the same document is deleted twice in parallel", async () => {
    const [existing] = await demoUser(DEMO_LIMITS.documents);

    await inParallel(2, () => fetch(`${baseUrl}/${existing._id}`, { method: "DELETE" }));

    expect((await User.findById(current.user._id)).demoDocuments).toBe(DEMO_LIMITS.documents - 1);
  });

  it("gives the slot back when creating the document fails", async () => {
    await demoUser(1);
    const create = vi.spyOn(Document, "create").mockRejectedValueOnce(new Error("write failed"));

    expect((await createDocument(0)).status).toBe(500);
    create.mockRestore();

    expect((await User.findById(current.user._id)).demoDocuments).toBe(1);
  });

  it("never stores more attachments on a document than the limit, and leaves no file behind", async () => {
    const [doc] = await demoUser(1);

    const responses = await inParallel(PARALLEL, () => uploadTo(doc._id));

    expect((await Document.findById(doc._id)).attachments).toHaveLength(DEMO_LIMITS.attachmentsPerDocument);
    expect(await storedFiles()).toBe(DEMO_LIMITS.attachmentsPerDocument);
    expect(statuses(responses)).toEqual([200, ...Array(PARALLEL - 1).fill(403)]);
  });

  it("removes a demo attachment once when it is deleted twice in parallel", async () => {
    const [doc] = await demoUser(1);
    const attachment = await (await uploadTo(doc._id)).json();

    const responses = await inParallel(2, () => fetch(`${baseUrl}/${doc._id}/attachments/${attachment._id}`, { method: "DELETE" }));

    expect(statuses(responses)).toEqual([204, 404]);
    expect((await Document.findById(doc._id)).attachments).toHaveLength(0);
    expect(await storedFiles()).toBe(0);
  });
});
