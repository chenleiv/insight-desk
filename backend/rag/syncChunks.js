import { Chunk } from "../models.js";
import { buildDocumentChunks } from "./buildChunks.js";

/**
 * Replace a document's chunks with fresh ones built from its current text.
 * Delete and insert run in one transaction: the caller's `session` when given,
 * otherwise a new one, so a failed insert never leaves the document without chunks.
 * With `embed`, each chunk also gets an `embedding`, computed before the
 * transaction opens so the slow model call does not hold it open.
 */
export async function syncDocumentChunks(doc, session, { embed } = {}) {
  const chunks = buildDocumentChunks(doc);
  if (embed) {
    for (const chunk of chunks) chunk.embedding = await embed(chunk.text);
  }

  const replace = async (s) => {
    await Chunk.deleteMany({ docId: doc._id }, { session: s });
    if (chunks.length) await Chunk.insertMany(chunks, { session: s });
  };

  if (session) await replace(session);
  else await Chunk.db.transaction(replace);
  return chunks.length;
}

/** Remove all chunks of one document, or of several when given an array. */
export async function deleteDocumentChunks(docIds, session) {
  const ids = Array.isArray(docIds) ? docIds : [docIds];
  await Chunk.deleteMany({ docId: { $in: ids } }, { session });
}
