// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { EventEmitter } from "events";

const USER = { _id: "user-1", role: "admin" };

const { Document, gridfs, extractTextFromBuffer } = vi.hoisted(() => ({
  Document: { findById: vi.fn() },
  gridfs: { files: new Map(), deleted: [], content: "" },
  extractTextFromBuffer: vi.fn(),
}));

vi.mock("../../models.js", () => ({ Document }));
vi.mock("../../rag/syncChunks.js", () => ({ syncDocumentChunks: vi.fn(), deleteDocumentChunks: vi.fn() }));
vi.mock("../../rag/embed.js", () => ({ embed: vi.fn() }));
vi.mock("../../rag/embedMissing.js", () => ({ scheduleEmbeddingRetry: vi.fn() }));
vi.mock("../../auth.js", () => {
  const authenticate = (req, _res, next) => {
    req.user = USER;
    next();
  };
  return { getCurrentUser: authenticate, requireAdmin: authenticate, requireEditor: authenticate };
});
vi.mock("../../textExtract.js", () => ({ extractTextFromBuffer }));
vi.mock("../../logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
// Records which files are stored, so a test can see one left behind.
vi.mock("mongodb", async () => {
  const { Readable } = await import("stream");
  let next = 0;
  return {
    GridFSBucket: class {
      openUploadStream(name, options) {
        const stream = new EventEmitter();
        stream.id = `gridfs-${++next}`;
        stream.end = () => setImmediate(() => {
          gridfs.files.set(stream.id, { name, ...options });
          stream.emit("finish");
        });
        return stream;
      }
      openDownloadStream() {
        return Readable.from([Buffer.from(gridfs.content)]);
      }
      delete(id) {
        gridfs.deleted.push(id);
        gridfs.files.delete(id);
        return Promise.resolve();
      }
    },
  };
});

import documentsRouter from "../documents.js";

// Minimal stand-in for a Mongoose document with an attachments subarray.
function fakeDoc(attachments = []) {
  const doc = {
    _id: "doc-1",
    content: "Policy text.",
    attachments: Object.assign([...attachments], {
      id: (id) => doc.attachments.find((a) => String(a._id) === id),
    }),
    save: vi.fn(async () => doc),
  };
  return doc;
}

function upload(blobParts, type, fileName) {
  const form = new FormData();
  form.append("file", new Blob(blobParts, { type }), fileName);
  return fetch(`${baseUrl}/doc-1/attachments`, { method: "POST", body: form });
}

let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  app.use("/api/documents", documentsRouter);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/documents`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  vi.clearAllMocks();
  gridfs.files.clear();
  gridfs.deleted.length = 0;
  extractTextFromBuffer.mockResolvedValue("Attachment text.");
});

describe("attachment upload file types", () => {
  it("accepts a .md file sent with a generic MIME type and stores it as markdown", async () => {
    const doc = fakeDoc();
    Document.findById.mockResolvedValue(doc);

    const res = await upload(["# Notes"], "application/octet-stream", "notes.md");

    expect(res.status).toBe(200);
    expect((await res.json()).fileType).toBe("text/markdown");
    expect(extractTextFromBuffer).toHaveBeenCalledWith(expect.any(Buffer), "text/markdown");
    expect([...gridfs.files.values()][0].contentType).toBe("text/markdown");
  });

  it("decides the type from the extension when the browser sends another name for it", async () => {
    Document.findById.mockResolvedValue(fakeDoc());

    const res = await upload(["# Notes"], "text/x-markdown", "notes.md");

    expect(res.status).toBe(200);
    expect((await res.json()).fileType).toBe("text/markdown");
    expect(extractTextFromBuffer).toHaveBeenCalledWith(expect.any(Buffer), "text/markdown");
    expect([...gridfs.files.values()][0].contentType).toBe("text/markdown");
  });

  it("rejects a file whose MIME type belongs to another type", async () => {
    const doc = fakeDoc();
    Document.findById.mockResolvedValue(doc);

    const res = await upload(["%PDF"], "application/pdf", "notes.txt");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: 'File type "application/pdf" is not allowed' });
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("rejects an extension that is not allowed, even with an allowed MIME type", async () => {
    Document.findById.mockResolvedValue(fakeDoc());

    const res = await upload(["<html>"], "text/plain", "page.html");

    expect(res.status).toBe(400);
    expect(gridfs.files.size).toBe(0);
  });
});

describe("attachment upload failures leave no stored file", () => {
  it("removes the stored file when the document save fails", async () => {
    const doc = fakeDoc();
    doc.save.mockRejectedValueOnce(new Error("write conflict"));
    Document.findById.mockResolvedValue(doc);

    const res = await upload(["hello"], "text/plain", "notes.txt");

    expect(res.status).toBe(500);
    expect(gridfs.deleted).toHaveLength(1);
    expect(gridfs.files.size).toBe(0);
  });

  it("stores nothing when text extraction fails", async () => {
    Document.findById.mockResolvedValue(fakeDoc());
    extractTextFromBuffer.mockRejectedValueOnce(new Error("bad file"));

    const res = await upload(["hello"], "text/plain", "notes.txt");

    expect(res.status).toBe(500);
    expect(gridfs.files.size).toBe(0);
  });
});

describe("attachment file download", () => {
  it("serves the file as a download with its extension's type, never sniffed", async () => {
    gridfs.content = "<script>alert(1)</script>";
    Document.findById.mockResolvedValue(fakeDoc([
      { _id: "att-1", gridfsId: "g-1", fileName: "notes.md", fileType: "text/markdown" },
    ]));

    const res = await fetch(`${baseUrl}/doc-1/attachments/att-1/file`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/markdown/);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="notes\.md"/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("serves a stored type that does not match the extension as a generic download", async () => {
    gridfs.content = "<html></html>";
    Document.findById.mockResolvedValue(fakeDoc([
      { _id: "att-1", gridfsId: "g-1", fileName: "page.html", fileType: "text/html" },
    ]));

    const res = await fetch(`${baseUrl}/doc-1/attachments/att-1/file`);

    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment/);
  });
});

describe("files the extractor refuses", () => {
  const refusal = (status, message, retryAfter) =>
    Object.assign(new Error(message), { isExtractionError: true, status, retryAfter });

  it("answers 422 with the safe message and stores nothing", async () => {
    const doc = fakeDoc();
    Document.findById.mockResolvedValue(doc);
    extractTextFromBuffer.mockRejectedValue(refusal(422, "This spreadsheet is too large to process."));

    const res = await upload(["hello"], "text/plain", "notes.txt");

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ detail: "This spreadsheet is too large to process." });
    expect(gridfs.files.size).toBe(0);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("answers 503 with Retry-After when too many files are waiting", async () => {
    Document.findById.mockResolvedValue(fakeDoc());
    extractTextFromBuffer.mockRejectedValue(refusal(503, "The server is busy.", 30));

    const res = await upload(["hello"], "text/plain", "notes.txt");

    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("30");
  });

  it("gives the same answer on the route that only extracts text", async () => {
    extractTextFromBuffer.mockRejectedValue(refusal(422, "This file expands to too much data to process."));
    const form = new FormData();
    form.append("file", new Blob(["hello"], { type: "text/plain" }), "notes.txt");

    const res = await fetch(`${baseUrl}/extract-text`, { method: "POST", body: form });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ detail: "This file expands to too much data to process." });
  });
});
