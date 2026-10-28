import { RetrievalLog } from "../models.js";
import { CHUNK_SIZE } from "./buildChunks.js";
import { logger } from "../logger.js";

/**
 * Record one chat question's retrieval for production measurement. Only IDs
 * and scores are copied from `results`: the question, chunk text and user are
 * never stored. A failed write is logged and never breaks the chat.
 */
export async function logRetrieval(results, { noInfo, minSimilarity }) {
  try {
    await RetrievalLog.create({
      results: results.map((r) => ({ docId: r.docId, index: r.index, score: r.score })),
      noInfo,
      chunkSize: CHUNK_SIZE,
      minSimilarity,
    });
  } catch (err) {
    logger.warn("Could not save retrieval log", { message: err.message });
  }
}
