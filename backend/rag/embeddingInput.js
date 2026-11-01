import { chunkKey } from "./chunkKey.js";
import { EMBEDDING_MODEL, EMBEDDING_MODEL_REVISION, EMBEDDING_FORMAT_VERSION } from "./embeddingModel.js";

export { EMBEDDING_FORMAT_VERSION } from "./embeddingModel.js";

/**
 * The text that is embedded for a chunk: the document title, a blank line,
 * then the chunk text. The title gives a short question that names only the
 * topic something to match. The stored chunk text, which the model reads and
 * citations point to, never includes it.
 */
export function embeddingText(title, text) {
  const heading = (title ?? "").trim();
  return heading ? `${heading}\n\n${text}` : text;
}

/**
 * A key for the vector of one chunk: it changes whenever the embedded text,
 * the format or the model changes, so a stored vector is reused only when it
 * would come out the same.
 */
export function embeddingKey(title, text) {
  return chunkKey(
    `${EMBEDDING_MODEL}@${EMBEDDING_MODEL_REVISION}\nformat ${EMBEDDING_FORMAT_VERSION}\n${embeddingText(title, text)}`,
  );
}
