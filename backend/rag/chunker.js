// Matches a sentence ending in . ! or ?, or a trailing fragment with no terminator.
const SENTENCE_PATTERN = /[^.!?]*[.!?]+|[^.!?]+$/g;

/**
 * Split text into chunks of at most `size` characters.
 * Chunks are built from whole sentences; consecutive chunks share up to
 * `overlap` characters of trailing sentences. A sentence longer than `size`
 * is split by characters.
 */
export function chunkText(text, size, overlap) {
  if (typeof text !== "string") {
    throw new TypeError("text must be a string");
  }
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError("size must be a positive integer");
  }
  if (!Number.isInteger(overlap) || overlap < 0 || overlap >= size) {
    throw new RangeError("overlap must be an integer >= 0 and < size");
  }

  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= size) return [trimmed];

  const sentences = (trimmed.match(SENTENCE_PATTERN) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks = [];
  let current = [];

  for (const sentence of sentences) {
    if (sentence.length > size) {
      if (current.length) chunks.push(current.join(" "));
      current = [];
      chunks.push(...splitByChars(sentence, size, overlap));
      continue;
    }

    const candidate = [...current, sentence];
    if (candidate.join(" ").length <= size) {
      current = candidate;
      continue;
    }

    chunks.push(current.join(" "));
    // Leave room for the new sentence plus the joining space.
    const room = Math.min(overlap, size - sentence.length - 1);
    current = [...tailWithin(current, room), sentence];
  }

  if (current.length) chunks.push(current.join(" "));
  return chunks;
}

// Trailing sentences whose joined length fits within `limit`.
function tailWithin(sentences, limit) {
  const tail = [];
  for (let i = sentences.length - 1; i >= 0; i--) {
    const next = [sentences[i], ...tail];
    if (next.join(" ").length > limit) break;
    tail.unshift(sentences[i]);
  }
  return tail;
}

function splitByChars(sentence, size, overlap) {
  const parts = [];
  const step = size - overlap;
  for (let start = 0; start < sentence.length; start += step) {
    parts.push(sentence.slice(start, start + size).trim());
    if (start + size >= sentence.length) break;
  }
  return parts.filter(Boolean);
}
