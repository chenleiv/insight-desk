import { createHash } from "crypto";

/**
 * A stable key for a chunk's text: its SHA-256 hex digest. Identical text
 * always gets the same key, and any edit to the text changes it.
 */
export function chunkKey(text) {
  return createHash("sha256").update(text).digest("hex");
}
