// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { EventEmitter } from "events";

const USER = { _id: "user-1", role: "admin" };

const { Document, sync, remove } = vi.hoisted(() => ({
  Document: {
    create: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
    deleteMany: vi.fn(),
    insertMany: vi.fn(),
  },
  sync: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("../../models.js", () => ({ Document }));
vi.mock("../../rag/syncChunks.js", () => ({
  syncDocumentChunks: sync,
  deleteDocumentChunks: remove,
}));
vi.mock("../../auth.js", () => {
  const authenticate = (req, _res, next) => {
    req.user = USER;
    next();
  };
  return { getCurrentUser: authenticate, requireAdmin: authenticate };
});
vi.mock("../../textExtract.js", () => ({
  extractTextFromBuffer: vi.fn(async () => "Attachment text."),
}));
vi.mock("../../logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock("mongodb", () => ({
  GridFSBucket: class {
    openUploadStream() {
      const stream = new EventEmitter();
      stream.id = "gridfs-1";
      stream.end = () => setImmediate(() => stream.emit("finish"));
      return stream;
    }
    delete() {
      return Promise.resolve();
    }
  },
}));

import documentsRouter from "../documents.js";

const BODY = { title: "Policy", category: "HR", content: "Policy text." };

// Minimal stand-in for a Mongoose document with an attachments subarray.
function fakeDoc(attachments = []) {
  const doc = {
    _id: "doc-1",
    content: "Policy text.",
    attachments: Object.assign([...attachments], {
      id: (id) => doc.attachments.find((a) => String(a._id) === id),
      pull: ({ _id }) => {
        doc.attachments.splice(doc.attachments.findIndex((a) => String(a._id) === _id), 1);
      },
    }),
    save: vi.fn(async () => doc),
  };
  return doc;
}

let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/documents", documentsRouter);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/documents`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => vi.clearAllMocks());

const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("document routes keep chunks in sync", () => {
  it("create sets ownerId from the logged-in user and builds chunks", async () => {
    const created = { _id: "doc-1", ...BODY, ownerId: USER._id };
    Document.create.mockResolvedValue(created);

    const res = await fetch(baseUrl, json("POST", BODY));

    expect(res.status).toBe(200);
    expect(Document.create).toHaveBeenCalledWith({ ...BODY, ownerId: USER._id });
    expect(sync).toHaveBeenCalledWith(created);
  });

  it("edit rebuilds chunks and does not change the owner", async () => {
    const updated = { _id: "doc-1", ...BODY, ownerId: "owner-0" };
    Document.findByIdAndUpdate.mockResolvedValue(updated);

    const res = await fetch(`${baseUrl}/doc-1`, json("PUT", { ...BODY, ownerId: "attacker" }));

    expect(res.status).toBe(200);
    expect(Document.findByIdAndUpdate).toHaveBeenCalledWith("doc-1", BODY, { new: true });
    expect(sync).toHaveBeenCalledWith(updated);
  });

  it("attachment add rebuilds chunks including the extracted text", async () => {
    const doc = fakeDoc();
    Document.findById.mockResolvedValue(doc);
    const form = new FormData();
    form.append("file", new Blob(["hello"], { type: "text/plain" }), "notes.txt");

    const res = await fetch(`${baseUrl}/doc-1/attachments`, { method: "POST", body: form });

    expect(res.status).toBe(200);
    expect(doc.save).toHaveBeenCalled();
    expect(sync).toHaveBeenCalledWith(doc);
    expect(sync.mock.calls[0][0].attachments[0].extractedText).toBe("Attachment text.");
  });

  it("attachment delete rebuilds chunks without the removed attachment", async () => {
    const doc = fakeDoc([{ _id: "att-1", gridfsId: "gridfs-1", extractedText: "Old." }]);
    Document.findById.mockResolvedValue(doc);

    const res = await fetch(`${baseUrl}/doc-1/attachments/att-1`, { method: "DELETE" });

    expect(res.status).toBe(204);
    expect(sync).toHaveBeenCalledWith(doc);
    expect(sync.mock.calls[0][0].attachments).toHaveLength(0);
  });

  it("document delete removes its chunks", async () => {
    Document.findByIdAndDelete.mockResolvedValue({ _id: "doc-1", attachments: [] });

    const res = await fetch(`${baseUrl}/doc-1`, { method: "DELETE" });

    expect(res.status).toBe(204);
    expect(remove).toHaveBeenCalledWith("doc-1");
    expect(sync).not.toHaveBeenCalled();
  });

  it("bulk import in replace mode drops old chunks, sets owners and builds new chunks", async () => {
    Document.find.mockResolvedValue([{ _id: "old-1" }, { _id: "old-2" }]);
    const inserted = [{ _id: "new-1", ...BODY, ownerId: USER._id }];
    Document.insertMany.mockResolvedValue(inserted);

    const res = await fetch(
      `${baseUrl}/import-bulk`,
      json("POST", { mode: "replace", documents: [{ ...BODY, ownerId: "attacker" }] }),
    );

    expect(res.status).toBe(200);
    expect(remove).toHaveBeenCalledWith(["old-1", "old-2"]);
    expect(Document.insertMany).toHaveBeenCalledWith([{ ...BODY, ownerId: USER._id }]);
    expect(sync).toHaveBeenCalledWith(inserted[0]);
  });

  it("still succeeds when rebuilding chunks fails after the document is saved", async () => {
    Document.create.mockResolvedValue({ _id: "doc-1", ...BODY });
    sync.mockRejectedValueOnce(new Error("db down"));

    const res = await fetch(baseUrl, json("POST", BODY));

    expect(res.status).toBe(200);
  });
});
