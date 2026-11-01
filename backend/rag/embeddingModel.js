// How chunk vectors are made, kept apart from embed.js so code that only
// needs these constants (cache keys, tests) never loads the model library.
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
// Pinned commit, so a change upstream cannot silently swap the model.
export const EMBEDDING_MODEL_REVISION = "751bff37182d3f1213fa05d7196b954e230abad9";
export const EMBEDDING_DIMENSIONS = 384;
// Bump when embeddingText in embeddingInput.js changes, so every stored vector is recomputed.
export const EMBEDDING_FORMAT_VERSION = 1;
