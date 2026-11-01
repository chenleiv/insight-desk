import { Chunk } from "../models.js";
import { buildDocumentChunks } from "./buildChunks.js";
import { embeddingKey, embeddingText } from "./embeddingInput.js";

/**
 * Replace a document's chunks with fresh ones built from its current text.
 * Delete and insert run in one transaction: the caller's `session` when given,
 * otherwise a new one, so a failed insert never leaves the document without chunks.
 * With `embed`, each chunk also gets an `embedding` of its title and text,
 * and the `embeddingKey` it was made from, computed before the transaction
 * opens so the slow model call does not hold it open.
 * With `reuseEmbeddings`, a chunk keeps a stored embedding whose key matches,
 * so a small edit only embeds the chunks it touched; a new title, format or
 * model changes every key and re-embeds them all.
 */
export async function syncDocumentChunks(doc, session, { embed, reuseEmbeddings = false } = {}) {
  const chunks = buildDocumentChunks(doc);
  if (embed) {
    const stored = reuseEmbeddings ? await storedEmbeddings(doc._id) : new Map();
    for (const chunk of chunks) {
      chunk.embeddingKey = embeddingKey(doc.title, chunk.text);
      chunk.embedding = stored.get(chunk.embeddingKey) ?? await embed(embeddingText(doc.title, chunk.text));
    }
  }

  const replace = async (s) => {
    await Chunk.deleteMany({ docId: doc._id }, { session: s });
    if (chunks.length) await Chunk.insertMany(chunks, { session: s });
  };

  if (session) await replace(session);
  else await Chunk.db.transaction(replace);
  return chunks.length;
}

/**
 * Map each stored embedding key of a document to its embedding. Chunks without
 * an embedding, or saved before keys existed, are skipped and get re-embedded.
 */
async function storedEmbeddings(docId) {
  const existing = await Chunk.find({ docId }, "embedding embeddingKey").lean();
  return new Map(existing.filter((c) => c.embedding?.length && c.embeddingKey).map((c) => [c.embeddingKey, c.embedding]));
}

/** Remove all chunks of one document, or of several when given an array. */
export async function deleteDocumentChunks(docIds, session) {
  const ids = Array.isArray(docIds) ? docIds : [docIds];
  await Chunk.deleteMany({ docId: { $in: ids } }, { session });
}
