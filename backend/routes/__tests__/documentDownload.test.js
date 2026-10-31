// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";

const ADMIN = { _id: "admin-1", role: "admin" };
const VIEWER = { _id: "viewer-1", role: "viewer" };
const DEMO = { _id: "demo-1", role: "demo" };

const { Document, auth } = vi.hoisted(() => ({
  Document: { findById: vi.fn() },
  auth: { user: null },
}));

vi.mock("../../models.js", () => ({ Document }));
vi.mock("../../rag/syncChunks.js", () => ({ syncDocumentChunks: vi.fn(), deleteDocumentChunks: vi.fn() }));
vi.mock("../../rag/embed.js", () => ({ embed: vi.fn() }));
vi.mock("../../rag/embedMissing.js", () => ({ scheduleEmbeddingRetry: vi.fn() }));
vi.mock("../../textExtract.js", () => ({ extractTextFromBuffer: vi.fn() }));
vi.mock("../../logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock("mongodb", () => ({ GridFSBucket: class {} }));
vi.mock("../../auth.js", () => {
  const authenticate = (req, _res, next) => {
    req.user = auth.user;
    next();
  };
  return { getCurrentUser: authenticate, requireAdmin: authenticate, requireEditor: authenticate };
});

import documentsRouter from "../documents.js";
import { MAX_EXPORT_CHARS } from "../../documentExport.js";

const SHARED_DOC = { _id: "doc-1", title: "Handbook", category: "HR", content: "Policy text.", ownerId: "admin-1", demo: false };
const OWN_DEMO_DOC = { _id: "doc-2", title: "My notes", category: "Misc", content: "Notes.", ownerId: "demo-1", demo: true };
const OTHER_DEMO_DOC = { _id: "doc-3", title: "Other", category: "Misc", content: "Secret.", ownerId: "demo-2", demo: true };

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
  auth.user = ADMIN;
});

const download = (id, format) => fetch(`${baseUrl}/${id}/download?format=${format}`);

describe("GET /api/documents/:id/download access", () => {
  it.each(["md", "pdf", "docx"])("returns 404 (%s) when a demo user asks for another user's document", async (format) => {
    auth.user = DEMO;
    Document.findById.mockResolvedValue(OTHER_DEMO_DOC);

    const res = await download("doc-3", format);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: "Not found" });
    expect(res.headers.get("content-disposition")).toBeNull();
  });

  it.each(["md", "pdf", "docx"])("returns 404 (%s) when a demo user asks for a shared document", async (format) => {
    auth.user = DEMO;
    Document.findById.mockResolvedValue(SHARED_DOC);

    expect((await download("doc-1", format)).status).toBe(404);
  });

  it.each([ADMIN, VIEWER])("returns 404 when $role asks for a demo document", async (user) => {
    auth.user = user;
    Document.findById.mockResolvedValue(OWN_DEMO_DOC);

    expect((await download("doc-2", "md")).status).toBe(404);
  });

  it("returns 404 for a missing document", async () => {
    Document.findById.mockResolvedValue(null);

    expect((await download("missing", "pdf")).status).toBe(404);
  });

  it("lets a viewer download a shared document, like reading it", async () => {
    auth.user = VIEWER;
    Document.findById.mockResolvedValue(SHARED_DOC);

    const res = await download("doc-1", "md");

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("# Handbook\n\nCategory: HR\n\nPolicy text.\n");
  });

  it("lets a demo user download their own document", async () => {
    auth.user = DEMO;
    Document.findById.mockResolvedValue(OWN_DEMO_DOC);

    expect((await download("doc-2", "docx")).status).toBe(200);
  });
});

describe("GET /api/documents/:id/download format and headers", () => {
  it("rejects a missing or unknown format with 400 before loading the document", async () => {
    for (const query of ["", "?format=html", "?format=../../x"]) {
      const res = await fetch(`${baseUrl}/doc-1/download${query}`);
      expect(res.status).toBe(400);
    }
    expect(Document.findById).not.toHaveBeenCalled();
  });

  it.each([
    ["md", "text/markdown; charset=utf-8"],
    ["pdf", "application/pdf"],
    ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ])("serves %s as an attachment that the browser does not sniff or cache", async (format, type) => {
    Document.findById.mockResolvedValue(SHARED_DOC);

    const res = await download("doc-1", format);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(type);
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="Handbook.${format}"`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("sanitizes the title in Content-Disposition and encodes non-ASCII names", async () => {
    Document.findById.mockResolvedValue({ ...SHARED_DOC, title: 'מדריך\r\nX-Evil: 1 "../a"' });

    const res = await download("doc-1", "md");

    expect(res.status).toBe(200);
    expect(res.headers.get("x-evil")).toBeNull();
    const disposition = res.headers.get("content-disposition");
    expect(disposition).not.toMatch(/[\r\n]/);
    expect(disposition).toMatch(/^attachment; filename="[^"\\/]*\.md"; filename\*=UTF-8''/);
    const encoded = disposition.split("filename*=UTF-8''")[1];
    // Dots between words are kept; only the separators that make a path are removed.
    expect(decodeURIComponent(encoded)).toBe("מדריך X-Evil 1 .. a.md");
  });

  it("returns 422 with a readable message for Hebrew text as PDF, and Word still works", async () => {
    Document.findById.mockResolvedValue({ ...SHARED_DOC, content: "שלום" });

    const pdf = await download("doc-1", "pdf");
    expect(pdf.status).toBe(422);
    expect((await pdf.json()).detail).toMatch(/Download it as Markdown or Word instead/);

    expect((await download("doc-1", "docx")).status).toBe(200);
  });

  it("enforces the export size cap for PDF and Word", async () => {
    Document.findById.mockResolvedValue({ ...SHARED_DOC, content: "a".repeat(MAX_EXPORT_CHARS + 1) });

    for (const format of ["pdf", "docx"]) {
      const res = await download("doc-1", format);
      expect(res.status).toBe(422);
      expect((await res.json()).detail).toMatch(/only be downloaded as Markdown/);
    }
    expect((await download("doc-1", "md")).status).toBe(200);
  });

  it("hides internal error details", async () => {
    Document.findById.mockRejectedValue(new Error("MongoServerError: connection to 10.0.0.5 closed"));

    const res = await download("doc-1", "md");

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ detail: "Error downloading document" });
  });
});
