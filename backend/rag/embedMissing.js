import { Chunk, Document } from "../models.js";
import { logger } from "../logger.js";
import { embed as defaultEmbed } from "./embed.js";
import { embeddingKey, embeddingText } from "./embeddingInput.js";

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
    // null also matches a missing field, and unlike $exists: false it can use the partial index.
    const chunks = await Chunk.find({ embedding: null }, "docId text").limit(batchSize).lean();
    if (!chunks.length) return total;
    const titles = await documentTitles(chunks.map((c) => c.docId));
    for (const chunk of chunks) {
      const title = titles.get(String(chunk.docId));
      // A chunk replaced by a newer save in the meantime matches nothing here.
      await Chunk.updateOne(
        { _id: chunk._id },
        { $set: { embedding: await embed(embeddingText(title, chunk.text)), embeddingKey: embeddingKey(title, chunk.text) } },
      );
    }
    total += chunks.length;
  }
}

/** Map each document id to its title, in one query. */
async function documentTitles(docIds) {
  const docs = await Document.find({ _id: { $in: docIds } }, "title").lean();
  return new Map(docs.map((d) => [String(d._id), d.title]));
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
