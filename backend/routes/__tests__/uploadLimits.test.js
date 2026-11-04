// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";

const { Document, extractTextFromBuffer } = vi.hoisted(() => ({
  Document: { findById: vi.fn() },
  extractTextFromBuffer: vi.fn(async () => "Text."),
}));

vi.mock("../../models.js", () => ({ Document }));
vi.mock("../../rag/syncChunks.js", () => ({ syncDocumentChunks: vi.fn(), deleteDocumentChunks: vi.fn() }));
vi.mock("../../rag/embed.js", () => ({ embed: vi.fn() }));
vi.mock("../../rag/embedMissing.js", () => ({ scheduleEmbeddingRetry: vi.fn() }));
vi.mock("../../auth.js", () => {
  const authenticate = (req, _res, next) => {
    req.user = { _id: "user-1", role: "admin" };
    next();
  };
  return { getCurrentUser: authenticate, requireAdmin: authenticate, requireEditor: authenticate };
});
vi.mock("../../textExtract.js", () => ({ extractTextFromBuffer }));
vi.mock("../../logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock("mongodb", () => ({ GridFSBucket: class {} }));

import documentsRouter, { UPLOAD_RATE_LIMIT } from "../documents.js";

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
  extractTextFromBuffer.mockClear();
});

function extract(form) {
  return fetch(`${baseUrl}/extract-text`, { method: "POST", body: form });
}

function formWith(content, type, fileName) {
  const form = new FormData();
  form.append("file", new Blob(content, { type }), fileName);
  return form;
}

// The limit is per address and shared across the tests of this file, so the requests here stay few.
describe("upload form limits", () => {
  it("rejects a file whose content does not match its extension, before parsing it", async () => {
    const res = await extract(formWith(["<html></html>"], "application/pdf", "report.pdf"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: "This file is not a valid PDF file." });
    expect(extractTextFromBuffer).not.toHaveBeenCalled();
  });

  it("rejects a UTF-16 text file with a clear message", async () => {
    const res = await extract(formWith([new Uint8Array([0xff, 0xfe, 0x68, 0x00])], "text/plain", "notes.txt"));
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe("UTF-16 text files are not supported. Save the file as UTF-8 and try again.");
  });

  it("rejects a password-protected .xlsx with a clear message", async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const res = await extract(formWith([ole], "", "budget.xlsx"));
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe("This file is password protected. Remove the password and try again.");
  });

  it("rejects a form with an extra field", async () => {
    const form = formWith(["hello"], "text/plain", "notes.txt");
    form.append("extra", "value");
    expect((await extract(form)).status).toBe(400);
    expect(extractTextFromBuffer).not.toHaveBeenCalled();
  });

  it("rejects a form with a second file", async () => {
    const form = formWith(["hello"], "text/plain", "a.txt");
    form.append("file", new Blob(["world"], { type: "text/plain" }), "b.txt");
    expect((await extract(form)).status).toBe(400);
    expect(extractTextFromBuffer).not.toHaveBeenCalled();
  });

  it("rejects a file name that is too long", async () => {
    const res = await extract(formWith(["hello"], "text/plain", `${"a".repeat(300)}.txt`));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: "The file name is too long." });
  });
});

describe("upload rate limit", () => {
  it("counts both upload routes together, per address, and answers 429 past the limit", async () => {
    const statuses = [];
    // Earlier tests in this file used part of the limit, so this runs until it is refused.
    for (let i = 0; i <= UPLOAD_RATE_LIMIT; i++) {
      const res = i % 2
        ? await fetch(`${baseUrl}/64b7f0c2a1b2c3d4e5f60001/attachments`, { method: "POST", body: formWith(["hello"], "text/plain", "a.txt") })
        : await extract(formWith(["hello"], "text/plain", "a.txt"));
      statuses.push(res.status);
    }
    expect(statuses.at(-1)).toBe(429);
    const res = await extract(formWith(["hello"], "text/plain", "a.txt"));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ detail: "Too many uploads, please try again in 15 minutes." });
  });
});
