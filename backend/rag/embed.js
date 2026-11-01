import { pipeline } from "@huggingface/transformers";
import { EMBEDDING_MODEL, EMBEDDING_MODEL_REVISION } from "./embeddingModel.js";

export { EMBEDDING_MODEL, EMBEDDING_MODEL_REVISION, EMBEDDING_DIMENSIONS } from "./embeddingModel.js";

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
