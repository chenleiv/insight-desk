// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { Chunk, allChunks } = vi.hoisted(() => {
  const allChunks = [
    { docId: "doc-1", ownerId: "user-1", index: 0, text: "User one, first chunk." },
    { docId: "doc-1", ownerId: "user-1", index: 1, text: "User one, second chunk." },
    { docId: "doc-2", ownerId: "user-2", index: 0, text: "User two, private chunk." },
  ];
  // The fake applies the filter itself, so the result check is meaningful.
  const find = vi.fn(async (filter) => allChunks.filter((c) => c.ownerId === filter.ownerId));
  return { Chunk: { find }, allChunks };
});
vi.mock("../../models.js", () => ({ Chunk }));

import { findUserChunks } from "../findUserChunks.js";

beforeEach(() => vi.clearAllMocks());

describe("findUserChunks", () => {
  it("returns only the requested user's chunks", async () => {
    const result = await findUserChunks("user-1");

    expect(Chunk.find).toHaveBeenCalledOnce();
    expect(Chunk.find).toHaveBeenCalledWith({ ownerId: "user-1" });
    expect(result).toEqual(allChunks.filter((c) => c.ownerId === "user-1"));
    expect(result).toHaveLength(2);
    expect(result.some((c) => c.ownerId === "user-2")).toBe(false);
  });

  it.each([undefined, null, ""])("throws without querying when ownerId is %o", async (ownerId) => {
    await expect(findUserChunks(ownerId)).rejects.toThrow("ownerId is required");
    expect(Chunk.find).not.toHaveBeenCalled();
  });
});
