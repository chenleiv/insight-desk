import mongoose from "mongoose";
import { Chunk, Document } from "../models.js";
import { documentScope } from "../access.js";

export const MAX_CONTEXT_CHUNKS = 8;

/** Distinct lowercased words of two or more letters or digits, in any script. */
export function queryTokens(query) {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words.filter((w) => w.length >= 2))];
}

/** Keyword score of one chunk: matches in its document's title weigh more than in its text. */
export function scoreChunk(text, title, tokens) {
  const body = text.toLowerCase();
  const heading = title.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (heading.includes(token)) score += 3;
    if (body.includes(token)) score += 2;
  }
  return score;
}

/**
 * Return the chunks most relevant to `query`, best first, each with its
 * document's title. Only documents `user` may read are searched, using the
 * same rule as the documents routes. `user` must be the authenticated user
 * from the auth middleware, never one derived from the request.
 *
 * `docIds` narrows the search to documents the user selected; ids the user
 * may not read are ignored. With a selection, or when no chunk matches a
 * keyword (e.g. a Hebrew question about English documents), the opening
 * chunks are returned instead, so the model always gets some context.
 */
export async function retrieveChunks(user, query, docIds = [], limit = MAX_CONTEXT_CHUNKS) {
  if (!user?._id) throw new Error("An authenticated user is required");

  const filter = { ...documentScope(user) };
  if (docIds.length) filter._id = { $in: docIds.filter((id) => mongoose.isValidObjectId(id)) };

  const docs = await Document.find(filter, "_id title").lean();
  if (!docs.length) return [];
  const titles = new Map(docs.map((d) => [String(d._id), d.title ?? ""]));

  const chunks = await Chunk.find({ docId: { $in: docs.map((d) => d._id) } }, "docId index text").lean();
  const tokens = queryTokens(query);

  const scored = chunks.map((c) => {
    const title = titles.get(String(c.docId)) ?? "";
    return { docId: String(c.docId), index: c.index, text: c.text, title, score: scoreChunk(c.text, title, tokens) };
  });
  const matches = scored.filter((c) => c.score > 0);
  const pool = docIds.length > 0 || matches.length === 0 ? scored : matches;

  return pool.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit);
}
