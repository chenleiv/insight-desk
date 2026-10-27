// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";

const { User, Document, Chunk, remove, bucketDelete } = vi.hoisted(() => ({
  User: { find: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  Document: { find: vi.fn(), insertMany: vi.fn(), deleteMany: vi.fn() },
  Chunk: { insertMany: vi.fn() },
  remove: vi.fn(),
  bucketDelete: vi.fn(async () => {}),
}));
vi.mock("../models.js", () => ({ User, Document, Chunk }));
vi.mock("../rag/syncChunks.js", () => ({ deleteDocumentChunks: remove }));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock("mongodb", () => ({
  GridFSBucket: class {
    delete(id) {
      return bucketDelete(id);
    }
  },
}));

import { createDemoWorkspace, removeExpiredDemoWorkspaces, DEMO_TTL_MS } from "../demo.js";

const SAMPLES = JSON.parse(readFileSync(new URL("../demo/sample-documents.json", import.meta.url), "utf8"));
const NOW = new Date("2026-10-27T10:00:00Z");
const lean = (value) => ({ lean: async () => value });

beforeEach(() => {
  vi.clearAllMocks();
  User.find.mockReturnValue(lean([]));
});

describe("removeExpiredDemoWorkspaces", () => {
  it("does nothing when no demo workspace has expired", async () => {
    expect(await removeExpiredDemoWorkspaces(NOW)).toBe(0);
    expect(User.find).toHaveBeenCalledWith({ role: "demo", expiresAt: { $lt: NOW } }, "_id");
    expect(Document.deleteMany).not.toHaveBeenCalled();
    expect(User.deleteMany).not.toHaveBeenCalled();
  });

  it("removes only the expired users and everything they own", async () => {
    User.find.mockReturnValue(lean([{ _id: "demo-old" }]));
    Document.find.mockReturnValue(lean([
      { _id: "doc-a", attachments: [{ gridfsId: "file-a" }, { gridfsId: null }] },
      { _id: "doc-b", attachments: [] },
    ]));

    expect(await removeExpiredDemoWorkspaces(NOW)).toBe(1);

    expect(Document.find).toHaveBeenCalledWith({ ownerId: { $in: ["demo-old"] } }, "_id attachments.gridfsId");
    expect(bucketDelete).toHaveBeenCalledTimes(1);
    expect(bucketDelete).toHaveBeenCalledWith("file-a");
    expect(remove).toHaveBeenCalledWith(["doc-a", "doc-b"]);
    expect(Document.deleteMany).toHaveBeenCalledWith({ _id: { $in: ["doc-a", "doc-b"] } });
    expect(User.deleteMany).toHaveBeenCalledWith({ _id: { $in: ["demo-old"] } });
  });
});

describe("createDemoWorkspace", () => {
  it("creates a demo user that expires in 24 hours and owns a copy of every sample document", async () => {
    User.create.mockImplementation(async (u) => ({ _id: "demo-new", ...u }));
    Document.insertMany.mockImplementation(async (docs) => docs);

    const user = await createDemoWorkspace(NOW);

    expect(user.role).toBe("demo");
    expect(user.password_hash).toBeNull();
    expect(user.email).toMatch(/^demo-.+@demo\.invalid$/);
    expect(user.expiresAt.getTime()).toBe(NOW.getTime() + DEMO_TTL_MS);

    const copies = Document.insertMany.mock.calls[0][0];
    expect(copies).toHaveLength(SAMPLES.length);
    for (const [i, copy] of copies.entries()) {
      expect(copy).toEqual({ ...SAMPLES[i], ownerId: "demo-new", demo: true });
    }

    // All chunks go in with a single insert, each owned by the demo user.
    expect(Chunk.insertMany).toHaveBeenCalledTimes(1);
    const chunks = Chunk.insertMany.mock.calls[0][0];
    expect(chunks.length).toBeGreaterThanOrEqual(SAMPLES.length);
    expect(chunks.every((c) => c.ownerId === "demo-new")).toBe(true);
  });

  it("does not wait for the cleanup of old workspaces", async () => {
    User.find.mockReturnValue({ lean: () => new Promise(() => {}) });
    User.create.mockImplementation(async (u) => ({ _id: "demo-new", ...u }));
    Document.insertMany.mockImplementation(async (docs) => docs);

    await expect(createDemoWorkspace(NOW)).resolves.toMatchObject({ role: "demo" });
  });

  it("still creates the workspace when cleanup of old ones fails", async () => {
    User.find.mockImplementation(() => {
      throw new Error("db hiccup");
    });
    User.create.mockImplementation(async (u) => ({ _id: "demo-new", ...u }));
    Document.insertMany.mockImplementation(async (docs) => docs);

    await expect(createDemoWorkspace(NOW)).resolves.toMatchObject({ role: "demo" });
  });
});
