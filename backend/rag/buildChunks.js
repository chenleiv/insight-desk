import { chunkText } from "./chunker.js";

export const CHUNK_SIZE = 800;
export const CHUNK_OVERLAP = 150;

/**
 * Build chunk records for one document: its main content plus the text
 * extracted from each attachment. Each source is chunked separately so a
 * chunk never mixes two sources; `index` runs continuously across the document.
 * Chunks repeated within the document (ignoring whitespace) are kept once.
 */
export function buildDocumentChunks(doc, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const sources = [
    doc.content ?? "",
    ...(doc.attachments ?? []).map((a) => a.extractedText ?? ""),
  ];

  const seen = new Set();
  const texts = sources
    .flatMap((text) => chunkText(text, size, overlap))
    .filter((text) => {
      const key = text.replace(/\s+/g, " ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return texts.map((text, index) => ({
    docId: doc._id,
    ownerId: doc.ownerId ?? null,
    index,
    text,
  }));
}
