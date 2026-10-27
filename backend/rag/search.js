import { Chunk, Document } from "../models.js";
import { documentScope } from "../access.js";
import { embed } from "./embed.js";
import { cosineSimilarity } from "./similarity.js";

export const DEFAULT_SEARCH_RESULTS = 5;

/**
 * Semantic search: return the `k` chunks whose meaning is closest to `query`,
 * best first, each with its document's title and a similarity score. Only
 * documents `user` may read are searched, using the same rule as the
 * documents routes. `user` must be the authenticated user from the auth
 * middleware, never one derived from the request.
 *
 * Chunks without an embedding (or with one from a different model size) are
 * skipped. Similarity is computed in memory, since each user has only a few
 * dozen chunks.
 */
export async function search(user, query, k = DEFAULT_SEARCH_RESULTS) {
  if (!user?._id) throw new Error("An authenticated user is required");

  const docs = await Document.find(documentScope(user), "_id title").lean();
  if (!docs.length) return [];
  const titles = new Map(docs.map((d) => [String(d._id), d.title ?? ""]));

  const chunks = await Chunk.find(
    { docId: { $in: docs.map((d) => d._id) }, "embedding.0": { $exists: true } },
    "docId index text embedding",
  ).lean();
  if (!chunks.length) return [];

  const queryVector = await embed(query);

  return chunks
    .filter((c) => c.embedding.length === queryVector.length)
    .map((c) => ({
      docId: String(c.docId),
      title: titles.get(String(c.docId)) ?? "",
      index: c.index,
      text: c.text,
      score: cosineSimilarity(queryVector, c.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
