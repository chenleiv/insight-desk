// A sentence ends at . ! or ? followed by whitespace or the end of the line,
// so "OAuth 2.0", "3.14" and "example.com/a.b" stay whole. A line with no
// terminator is one sentence.
const SENTENCE_PATTERN = /.+?(?:[.!?]+(?=\s|$)|$)/g;

/**
 * Split text into chunks of at most `size` characters.
 * Chunks are built from whole sentences; consecutive chunks share up to
 * `overlap` characters of trailing sentences. A sentence longer than `size`
 * is split by characters. Each line of the text starts a new sentence and
 * keeps its own line in the chunk, so list items are not run together.
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

  const chunks = [];
  let current = [];

  for (const sentence of splitSentences(trimmed)) {
    if (sentence.text.length > size) {
      if (current.length) chunks.push(join(current));
      current = [];
      chunks.push(...splitByChars(sentence.text, size, overlap));
      continue;
    }

    const candidate = [...current, sentence];
    if (join(candidate).length <= size) {
      current = candidate;
      continue;
    }

    chunks.push(join(current));
    // Leave room for the new sentence plus the joining character.
    const room = Math.min(overlap, size - sentence.text.length - 1);
    current = [...tailWithin(current, room), sentence];
  }

  if (current.length) chunks.push(join(current));
  return chunks;
}

// Sentences in order; `lineStart` marks the first sentence of each line.
function splitSentences(text) {
  return text.split(/\n+/).flatMap((line) =>
    (line.match(SENTENCE_PATTERN) ?? [])
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s, i) => ({ text: s, lineStart: i === 0 })),
  );
}

// Sentences of one line are joined with a space, lines with a newline.
function join(sentences) {
  return sentences.map((s, i) => (i === 0 ? s.text : `${s.lineStart ? "\n" : " "}${s.text}`)).join("");
}

// Trailing sentences whose joined length fits within `limit`.
function tailWithin(sentences, limit) {
  const tail = [];
  for (let i = sentences.length - 1; i >= 0; i--) {
    const next = [sentences[i], ...tail];
    if (join(next).length > limit) break;
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
