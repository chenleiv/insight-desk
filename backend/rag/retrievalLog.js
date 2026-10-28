import { RetrievalLog } from "../models.js";
import { CHUNK_SIZE } from "./buildChunks.js";
import { keyedHash } from "../auth.js";
import { logger } from "../logger.js";

// Tied to this record, so two records of the same user do not share a tag.
const ownerTag = (user, logId) => keyedHash(`${user._id}:${logId}`);

/**
 * Record one chat question's retrieval for production measurement. Only IDs
 * and scores are copied from `results`: the question, chunk text and user are
 * never stored. Returns the record's id, which the client sends back with
 * feedback, or null if the write failed. A failed write never breaks the chat.
 */
export async function logRetrieval(user, results, { noInfo, minSimilarity }) {
  try {
    const log = new RetrievalLog({
      results: results.map((r) => ({ docId: r.docId, index: r.index, score: r.score })),
      noInfo,
      chunkSize: CHUNK_SIZE,
      minSimilarity,
    });
    log.ownerTag = ownerTag(user, log._id);
    await log.save();
    return String(log._id);
  } catch (err) {
    logger.warn("Could not save retrieval log", { message: err.message });
    return null;
  }
}

/**
 * Save a user's rating of one of their own answers, replacing any earlier one.
 * Returns false when no such answer belongs to the user (or it has expired).
 */
export async function saveFeedback(user, logId, rating) {
  const { matchedCount } = await RetrievalLog.updateOne(
    { _id: logId, ownerTag: ownerTag(user, logId) },
    { $set: { feedback: rating } },
  );
  return matchedCount === 1;
}
