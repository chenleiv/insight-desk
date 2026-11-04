// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import mongoose from "mongoose";
import { startMongoServer } from "../../__tests__/mongoMemory.js";

// Real database and routes, since what is measured is what Mongoose leaves out of the response.
const { current } = vi.hoisted(() => ({ current: { user: null } }));

vi.mock("../../logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("../../rag/embed.js", () => ({ embed: vi.fn() }));
vi.mock("../../rag/embedMissing.js", () => ({ scheduleEmbeddingRetry: vi.fn() }));
vi.mock("../../textExtract.js", () => ({ extractTextFromBuffer: vi.fn() }));
// Rebuilding chunks needs transactions, which a standalone test server does not have.
vi.mock("../../rag/syncChunks.js", () => ({ syncDocumentChunks: vi.fn(), deleteDocumentChunks: vi.fn() }));
vi.mock("../../auth.js", () => {
  const authenticate = (req, _res, next) => {
    req.user = current.user;
    next();
  };
  return { getCurrentUser: authenticate, requireAdmin: authenticate, requireEditor: authenticate };
});

import { Document } from "../../models.js";
import documentsRouter from "../documents.js";

const TEXT = "Text extracted from the file.";
const ATTACHMENT = { url: "/file", fileName: "notes.txt", fileType: "text/plain", fileSize: 5, extractedText: TEXT };

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
  await Document.deleteMany({});
  current.user = { _id: new mongoose.Types.ObjectId(), role: "admin" };
});

const newDoc = (fields = {}) =>
  Document.create({ title: "Doc", category: "HR", content: "Body.", attachments: [ATTACHMENT], ...fields });

describe("GET /api/documents", () => {
  it("leaves out the attachments' extracted text and keeps everything else", async () => {
    const doc = await newDoc();

    const res = await fetch(baseUrl);
    const [listed] = await res.json();

    expect(res.status).toBe(200);
    expect(listed).toMatchObject({ id: String(doc._id), title: "Doc", content: "Body." });
    expect(listed.attachments).toHaveLength(1);
    expect(listed.attachments[0]).toMatchObject({ fileName: "notes.txt", fileType: "text/plain", fileSize: 5, url: "/file" });
    expect(listed.attachments[0]).not.toHaveProperty("extractedText");
  });

  it("lists the newest document first", async () => {
    await newDoc({ title: "Old", createdAt: new Date("2026-01-01") });
    await newDoc({ title: "New", createdAt: new Date("2026-02-01") });

    const listed = await (await fetch(baseUrl)).json();

    expect(listed.map((d) => d.title)).toEqual(["New", "Old"]);
  });

  it("still returns the extracted text for a single document", async () => {
    const doc = await newDoc();

    const opened = await (await fetch(`${baseUrl}/${doc._id}`)).json();

    expect(opened.attachments[0].extractedText).toBe(TEXT);
  });

  it("keeps the extracted text in the database when a listed document is saved", async () => {
    const doc = await newDoc();
    const [listed] = await (await fetch(baseUrl)).json();

    const res = await fetch(`${baseUrl}/${doc._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...listed, title: "Edited" }),
    });

    expect(res.status).toBe(200);
    const stored = await Document.findById(doc._id).lean();
    expect(stored.title).toBe("Edited");
    expect(stored.attachments[0].extractedText).toBe(TEXT);
  });
});
