import { Chunk } from "../models.js";
import { buildDocumentChunks } from "./buildChunks.js";

/** Replace a document's chunks with fresh ones built from its current text. */
export async function syncDocumentChunks(doc) {
  const chunks = buildDocumentChunks(doc);
  await Chunk.deleteMany({ docId: doc._id });
  if (chunks.length) await Chunk.insertMany(chunks);
  return chunks.length;
}

/** Remove all chunks of one document, or of several when given an array. */
export async function deleteDocumentChunks(docIds) {
  const ids = Array.isArray(docIds) ? docIds : [docIds];
  await Chunk.deleteMany({ docId: { $in: ids } });
}
