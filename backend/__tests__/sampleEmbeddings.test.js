// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";

// Only the model constants are needed, so the model library is never loaded.
vi.mock("@huggingface/transformers", () => ({ pipeline: vi.fn() }));

import { EMBEDDING_MODEL, EMBEDDING_MODEL_REVISION, EMBEDDING_DIMENSIONS } from "../rag/embed.js";
import { buildDocumentChunks, CHUNK_SIZE, CHUNK_OVERLAP } from "../rag/buildChunks.js";
import { chunkKey } from "../rag/chunkKey.js";

const read = (name) => JSON.parse(readFileSync(new URL(`../demo/${name}`, import.meta.url), "utf8"));
const SAMPLES = read("sample-documents.json");
const FILE = read("sample-embeddings.json");
const STALE = "sample-embeddings.json is stale: run npm run embed:demo";

describe("sample-embeddings.json", () => {
  it("was built with the current model and chunk settings", () => {
    expect(
      {
        model: FILE.model,
        revision: FILE.revision,
        dimensions: FILE.dimensions,
        chunkSize: FILE.chunkSize,
        chunkOverlap: FILE.chunkOverlap,
      },
      STALE,
    ).toEqual({
      model: EMBEDDING_MODEL,
      revision: EMBEDDING_MODEL_REVISION,
      dimensions: EMBEDDING_DIMENSIONS,
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
    });
  });

  it("has a vector of the right length for every chunk of the sample documents", () => {
    const texts = SAMPLES.flatMap((doc) => buildDocumentChunks(doc).map((c) => c.text));
    const missing = texts.filter((text) => FILE.vectors[chunkKey(text)]?.length !== EMBEDDING_DIMENSIONS);
    expect(missing, STALE).toEqual([]);
  });

  it("has no vectors left over from chunks that no longer exist", () => {
    const keys = new Set(SAMPLES.flatMap((doc) => buildDocumentChunks(doc).map((c) => chunkKey(c.text))));
    const extra = Object.keys(FILE.vectors).filter((key) => !keys.has(key));
    expect(extra, STALE).toEqual([]);
  });
});
