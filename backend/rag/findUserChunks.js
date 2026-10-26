import { Chunk } from "../models.js";

/**
 * Return all chunks owned by one user.
 * Current access rule is owner-only; sharing between users is planned as a separate item.
 * A missing ownerId throws, so the query never runs without an owner filter.
 * Callers must pass the authenticated user's id (from auth middleware), never an id taken from the request.
 */
export async function findUserChunks(ownerId) {
  if (!ownerId) throw new Error("ownerId is required");
  return Chunk.find({ ownerId });
}
