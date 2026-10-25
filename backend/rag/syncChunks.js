import { Chunk } from "../models.js";
import { buildDocumentChunks } from "./buildChunks.js";

/**
 * Replace a document's chunks with fresh ones built from its current text.
 * Delete and insert run in one transaction: the caller's `session` when given,
 * otherwise a new one, so a failed insert never leaves the document without chunks.
 */
export async function syncDocumentChunks(doc, session) {
  const chunks = buildDocumentChunks(doc);

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
