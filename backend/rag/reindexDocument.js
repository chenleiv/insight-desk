import { Chunk } from "../models.js";
import { buildDocumentChunks } from "./buildChunks.js";
import { embeddingKey } from "./embeddingInput.js";
import { syncDocumentChunks } from "./syncChunks.js";

/**
 * Bring one document's chunks up to date, for `npm run reindex`: split it again
 * with the current chunker and embed each chunk whose key has no stored vector.
 * A document whose stored chunks already match is not written at all, so a
 * second run changes nothing. With `dryRun`, nothing is written either; the
 * counts say what a real run would do.
 * Returns { chunks, embedded, reused, changed, written }: `changed` means the
 * stored chunks are out of date, `written` that they were replaced.
 */
export async function reindexDocument(doc, { embed, dryRun = false }) {
  const fresh = buildDocumentChunks(doc).map((c) => ({ ...c, embeddingKey: embeddingKey(doc.title, c.text) }));
  const stored = await Chunk.find({ docId: doc._id }, "index text ownerId embedding embeddingKey")
    .sort({ index: 1 })
    .lean();

  const storedKeys = new Set(stored.filter(hasCurrentVector).map((c) => c.embeddingKey));
  const reused = fresh.filter((c) => storedKeys.has(c.embeddingKey)).length;
  const changed = !isUpToDate(fresh, stored);
  const stats = { chunks: fresh.length, embedded: changed ? fresh.length - reused : 0, reused, changed, written: false };
  if (dryRun || !changed) return stats;

  await syncDocumentChunks(doc, undefined, { embed, reuseEmbeddings: true });
  return { ...stats, written: true };
}

const hasCurrentVector = (c) => Boolean(c.embedding?.length && c.embeddingKey);

// Same chunks in the same order, each with a vector made from its current key.
function isUpToDate(fresh, stored) {
  return fresh.length === stored.length && fresh.every((c, i) => {
    const s = stored[i];
    return s.index === c.index
      && s.text === c.text
      && String(s.ownerId ?? null) === String(c.ownerId ?? null)
      && s.embeddingKey === c.embeddingKey
      && hasCurrentVector(s);
  });
}
