import { Chunk } from "../models.js";
import { buildDocumentChunks } from "./buildChunks.js";

/**
 * Replace a document's chunks with fresh ones built from its current text.
 * Delete and insert run in one transaction: the caller's `session` when given,
 * otherwise a new one, so a failed insert never leaves the document without chunks.
 * With `embed`, each chunk also gets an `embedding`, computed before the
 * transaction opens so the slow model call does not hold it open.
 * With `reuseEmbeddings`, a chunk whose text is unchanged keeps its stored
 * embedding, so a small edit only embeds the chunks it touched. Reindex leaves
 * it off, so a model change re-embeds everything.
 */
export async function syncDocumentChunks(doc, session, { embed, reuseEmbeddings = false } = {}) {
  const chunks = buildDocumentChunks(doc);
  if (embed) {
    const stored = reuseEmbeddings ? await storedEmbeddings(doc._id) : new Map();
    for (const chunk of chunks) chunk.embedding = stored.get(chunk.text) ?? await embed(chunk.text);
  }

  const replace = async (s) => {
    await Chunk.deleteMany({ docId: doc._id }, { session: s });
    if (chunks.length) await Chunk.insertMany(chunks, { session: s });
  };

  if (session) await replace(session);
  else await Chunk.db.transaction(replace);
  return chunks.length;
}

/** Map each stored chunk text of a document to its embedding, skipping chunks without one. */
async function storedEmbeddings(docId) {
  const existing = await Chunk.find({ docId }, "text embedding").lean();
  return new Map(existing.filter((c) => c.embedding?.length).map((c) => [c.text, c.embedding]));
}

/** Remove all chunks of one document, or of several when given an array. */
export async function deleteDocumentChunks(docIds, session) {
  const ids = Array.isArray(docIds) ? docIds : [docIds];
  await Chunk.deleteMany({ docId: { $in: ids } }, { session });
}
