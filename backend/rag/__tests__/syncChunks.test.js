// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { Chunk } = vi.hoisted(() => ({
  Chunk: {
    find: vi.fn(),
    deleteMany: vi.fn(),
    insertMany: vi.fn(),
    db: { transaction: vi.fn((fn) => fn("tx-session")) },
  },
}));
vi.mock("../../models.js", () => ({ Chunk }));

import { syncDocumentChunks, deleteDocumentChunks } from "../syncChunks.js";

beforeEach(() => vi.clearAllMocks());

describe("syncDocumentChunks", () => {
  it("deletes the old chunks, then inserts new ones in one transaction", async () => {
    const doc = { _id: "doc-1", ownerId: "user-1", content: "Some text.", attachments: [] };

    const count = await syncDocumentChunks(doc);

    expect(count).toBe(1);
    expect(Chunk.db.transaction).toHaveBeenCalledOnce();
    expect(Chunk.deleteMany).toHaveBeenCalledWith({ docId: "doc-1" }, { session: "tx-session" });
    expect(Chunk.insertMany).toHaveBeenCalledWith(
      [{ docId: "doc-1", ownerId: "user-1", index: 0, text: "Some text." }],
      { session: "tx-session" },
    );
    expect(Chunk.deleteMany.mock.invocationCallOrder[0])
      .toBeLessThan(Chunk.insertMany.mock.invocationCallOrder[0]);
  });

  it("uses the caller's session instead of opening a new transaction", async () => {
    await syncDocumentChunks({ _id: "doc-1", content: "Some text." }, "outer-session");

    expect(Chunk.db.transaction).not.toHaveBeenCalled();
    expect(Chunk.deleteMany).toHaveBeenCalledWith({ docId: "doc-1" }, { session: "outer-session" });
    expect(Chunk.insertMany).toHaveBeenCalledWith(expect.any(Array), { session: "outer-session" });
  });

  it("rethrows an insert failure so the transaction rolls back the delete", async () => {
    Chunk.insertMany.mockRejectedValueOnce(new Error("insert failed"));

    await expect(syncDocumentChunks({ _id: "doc-1", content: "Some text." }))
      .rejects.toThrow("insert failed");
  });

  it("adds an embedding to each chunk before the transaction when given embed", async () => {
    const embed = vi.fn(async (text) => [text.length, 1]);

    await syncDocumentChunks({ _id: "doc-1", content: "Some text." }, undefined, { embed });

    expect(embed).toHaveBeenCalledWith("Some text.");
    expect(Chunk.insertMany).toHaveBeenCalledWith(
      [expect.objectContaining({ text: "Some text.", embedding: [10, 1] })],
      { session: "tx-session" },
    );
    expect(embed.mock.invocationCallOrder[0])
      .toBeLessThan(Chunk.db.transaction.mock.invocationCallOrder[0]);
  });

  it("with reuseEmbeddings, embeds only chunks whose text changed", async () => {
    const embed = vi.fn(async () => [9, 9]);
    Chunk.find.mockReturnValue({
      lean: async () => [
        { text: "Unchanged.", embedding: [1, 1] },
        { text: "Old text.", embedding: [2, 2] },
      ],
    });
    const doc = { _id: "doc-1", content: "New text.", attachments: [{ extractedText: "Unchanged." }] };

    await syncDocumentChunks(doc, undefined, { embed, reuseEmbeddings: true });

    expect(Chunk.find).toHaveBeenCalledWith({ docId: "doc-1" }, "text embedding");
    expect(embed).toHaveBeenCalledOnce();
    expect(embed).toHaveBeenCalledWith("New text.");
    expect(Chunk.insertMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({ text: "New text.", embedding: [9, 9] }),
        expect.objectContaining({ text: "Unchanged.", embedding: [1, 1] }),
      ],
      { session: "tx-session" },
    );
  });

  it("with reuseEmbeddings, embeds a chunk whose stored copy has no embedding", async () => {
    const embed = vi.fn(async () => [9, 9]);
    Chunk.find.mockReturnValue({ lean: async () => [{ text: "Some text." }] });

    await syncDocumentChunks({ _id: "doc-1", content: "Some text." }, undefined, { embed, reuseEmbeddings: true });

    expect(embed).toHaveBeenCalledWith("Some text.");
  });

  it("without reuseEmbeddings, re-embeds every chunk and never reads stored ones", async () => {
    const embed = vi.fn(async () => [9, 9]);

    await syncDocumentChunks({ _id: "doc-1", content: "Some text." }, undefined, { embed });

    expect(Chunk.find).not.toHaveBeenCalled();
    expect(embed).toHaveBeenCalledWith("Some text.");
  });

  it("only deletes when the document has no text", async () => {
    const count = await syncDocumentChunks({ _id: "doc-1", content: "  " });

    expect(count).toBe(0);
    expect(Chunk.deleteMany).toHaveBeenCalledOnce();
    expect(Chunk.insertMany).not.toHaveBeenCalled();
  });
});

describe("deleteDocumentChunks", () => {
  it("accepts one id or several, and an optional session", async () => {
    await deleteDocumentChunks("doc-1");
    await deleteDocumentChunks(["doc-1", "doc-2"], "outer-session");

    expect(Chunk.deleteMany).toHaveBeenNthCalledWith(1, { docId: { $in: ["doc-1"] } }, { session: undefined });
    expect(Chunk.deleteMany).toHaveBeenNthCalledWith(
      2,
      { docId: { $in: ["doc-1", "doc-2"] } },
      { session: "outer-session" },
    );
  });
});
