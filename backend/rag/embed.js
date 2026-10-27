import { pipeline } from "@huggingface/transformers";

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
// Pinned commit, so a change upstream cannot silently swap the model.
export const EMBEDDING_MODEL_REVISION = "751bff37182d3f1213fa05d7196b954e230abad9";
export const EMBEDDING_DIMENSIONS = 384;

let extractorPromise;

/** Load the model once, on first use; later calls share the same instance. */
function getExtractor() {
  extractorPromise ??= pipeline("feature-extraction", EMBEDDING_MODEL, {
    revision: EMBEDDING_MODEL_REVISION,
  }).catch((err) => {
    extractorPromise = undefined;
    throw err;
  });
  return extractorPromise;
}

/**
 * Turn text into a vector with a local model. The vector is mean-pooled and
 * normalized to length 1, so cosine similarity equals the dot product.
 */
export async function embed(text) {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}
