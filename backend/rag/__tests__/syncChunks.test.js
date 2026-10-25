// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { Chunk } = vi.hoisted(() => ({
  Chunk: { deleteMany: vi.fn(), insertMany: vi.fn() },
}));
vi.mock("../../models.js", () => ({ Chunk }));

import { syncDocumentChunks, deleteDocumentChunks } from "../syncChunks.js";

beforeEach(() => vi.clearAllMocks());

describe("syncDocumentChunks", () => {
  it("deletes the old chunks, then inserts new ones with docId and ownerId", async () => {
    const doc = { _id: "doc-1", ownerId: "user-1", content: "Some text.", attachments: [] };

    const count = await syncDocumentChunks(doc);

    expect(count).toBe(1);
    expect(Chunk.deleteMany).toHaveBeenCalledWith({ docId: "doc-1" });
    expect(Chunk.insertMany).toHaveBeenCalledWith([
      { docId: "doc-1", ownerId: "user-1", index: 0, text: "Some text." },
    ]);
    expect(Chunk.deleteMany.mock.invocationCallOrder[0])
      .toBeLessThan(Chunk.insertMany.mock.invocationCallOrder[0]);
  });

  it("only deletes when the document has no text", async () => {
    const count = await syncDocumentChunks({ _id: "doc-1", content: "  " });

    expect(count).toBe(0);
    expect(Chunk.deleteMany).toHaveBeenCalledOnce();
    expect(Chunk.insertMany).not.toHaveBeenCalled();
  });
});

describe("deleteDocumentChunks", () => {
  it("accepts one id or several", async () => {
    await deleteDocumentChunks("doc-1");
    await deleteDocumentChunks(["doc-1", "doc-2"]);

    expect(Chunk.deleteMany).toHaveBeenNthCalledWith(1, { docId: { $in: ["doc-1"] } });
    expect(Chunk.deleteMany).toHaveBeenNthCalledWith(2, { docId: { $in: ["doc-1", "doc-2"] } });
  });
});
