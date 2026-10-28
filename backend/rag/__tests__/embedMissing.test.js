// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { Chunk, logger, defaultEmbed } = vi.hoisted(() => ({
  Chunk: { find: vi.fn(), updateOne: vi.fn() },
  logger: { info: vi.fn(), error: vi.fn() },
  defaultEmbed: vi.fn(),
}));
vi.mock("../../models.js", () => ({ Chunk }));
vi.mock("../../logger.js", () => ({ logger }));
vi.mock("../embed.js", () => ({ embed: defaultEmbed }));

import { embedMissingChunks, scheduleEmbeddingRetry, RETRY_DELAY_MS } from "../embedMissing.js";

// Each call to Chunk.find returns the next batch.
function batches(...lists) {
  for (const list of [...lists, []]) Chunk.find.mockReturnValueOnce({ limit: () => ({ lean: async () => list }) });
}

// Reset, not clear: a batch queued but not consumed must not leak into the next test.
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.useRealTimers());

describe("embedMissingChunks", () => {
  it("embeds only chunks stored without an embedding, batch after batch", async () => {
    const embed = vi.fn(async (text) => [text.length]);
    batches([{ _id: "c1", text: "ab" }, { _id: "c2", text: "abc" }], [{ _id: "c3", text: "a" }]);

    const count = await embedMissingChunks({ embed, batchSize: 2 });

    expect(count).toBe(3);
    expect(Chunk.find).toHaveBeenCalledWith({ embedding: { $exists: false } }, "text");
    expect(Chunk.updateOne).toHaveBeenCalledWith({ _id: "c1" }, { $set: { embedding: [2] } });
    expect(Chunk.updateOne).toHaveBeenCalledWith({ _id: "c3" }, { $set: { embedding: [1] } });
  });

  it("does nothing beyond one query when no chunk is missing an embedding", async () => {
    const embed = vi.fn();
    batches();

    expect(await embedMissingChunks({ embed })).toBe(0);
    expect(Chunk.find).toHaveBeenCalledOnce();
    expect(embed).not.toHaveBeenCalled();
  });

  it("stops and rethrows when embedding fails", async () => {
    const embed = vi.fn(async () => { throw new Error("model down"); });
    batches([{ _id: "c1", text: "a" }]);

    await expect(embedMissingChunks({ embed })).rejects.toThrow("model down");
    expect(Chunk.updateOne).not.toHaveBeenCalled();
  });
});

describe("scheduleEmbeddingRetry", () => {
  it("runs one repair after the delay, however many failures schedule it", async () => {
    vi.useFakeTimers();
    defaultEmbed.mockResolvedValue([1]);
    batches([{ _id: "c1", text: "a" }]);

    scheduleEmbeddingRetry();
    scheduleEmbeddingRetry();
    expect(Chunk.find).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);

    expect(Chunk.updateOne).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith("Embedded chunks that were missing an embedding", { count: 1 });
  });

  it("logs instead of throwing when the retry fails", async () => {
    vi.useFakeTimers();
    defaultEmbed.mockRejectedValue(new Error("model down"));
    batches([{ _id: "c1", text: "a" }]);

    scheduleEmbeddingRetry();
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);

    expect(logger.error).toHaveBeenCalledWith("Embedding missing chunks failed", { message: "model down" });
  });
});
