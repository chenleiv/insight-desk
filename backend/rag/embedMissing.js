import { Chunk } from "../models.js";
import { logger } from "../logger.js";
import { embed as defaultEmbed } from "./embed.js";

const BATCH_SIZE = 50;
export const RETRY_DELAY_MS = 60 * 1000;

/**
 * Embed every chunk stored without an embedding, a batch at a time.
 * Chunks are saved without one when embedding fails on save; search skips
 * them until this runs. When nothing is missing it is a single query.
 */
export async function embedMissingChunks({ embed = defaultEmbed, batchSize = BATCH_SIZE } = {}) {
  let total = 0;
  for (;;) {
    const chunks = await Chunk.find({ embedding: { $exists: false } }, "text").limit(batchSize).lean();
    if (!chunks.length) return total;
    for (const chunk of chunks) {
      // A chunk replaced by a newer save in the meantime matches nothing here.
      await Chunk.updateOne({ _id: chunk._id }, { $set: { embedding: await embed(chunk.text) } });
    }
    total += chunks.length;
  }
}

/** Run embedMissingChunks and log the outcome; never throws. */
export async function repairMissingEmbeddings() {
  try {
    const count = await embedMissingChunks();
    if (count) logger.info("Embedded chunks that were missing an embedding", { count });
  } catch (err) {
    logger.error("Embedding missing chunks failed", { message: err.message });
  }
}

let retryTimer;

/** One retry shortly after a failure; further failures while it is pending share it. */
export function scheduleEmbeddingRetry(delayMs = RETRY_DELAY_MS) {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    void repairMissingEmbeddings();
  }, delayMs);
  retryTimer.unref?.();
}
