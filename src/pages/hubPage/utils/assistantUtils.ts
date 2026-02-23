import type { DocumentItem } from "../../../api/documentsClient";

export const CHAT_KEY = "assistantChat";
export const CONTEXT_KEY = "assistantContext";

export function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
}

export function buildSnippet(content: string, query: string) {
  const clean = content.replace(/\s+/g, " ").trim();
  if (!clean) return "";

  if (!query) return clean.slice(0, 160) + (clean.length > 160 ? "…" : "");

  const q = query.toLowerCase();
  const idx = clean.toLowerCase().indexOf(q);
  if (idx === -1) return clean.slice(0, 160) + (clean.length > 160 ? "…" : "");

  const start = Math.max(0, idx - 60);
  const end = Math.min(clean.length, idx + 100);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < clean.length ? "…" : "";
  return prefix + clean.slice(start, end) + suffix;
}

export function scoreDoc(doc: DocumentItem, query: string) {
  const q = query.toLowerCase().trim();
  if (!q) return 0;

  const tokens = q
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  if (tokens.length === 0) return 0;

  const title = (doc.title || "").toLowerCase();
  const category = (doc.category || "").toLowerCase();
  const summary = (doc.summary || "").toLowerCase();
  const content = (doc.content || "").toLowerCase();

  let score = 0;

  for (const t of tokens) {
    if (title.includes(t)) score += 6;
    if (category.includes(t)) score += 3;
    if (summary.includes(t)) score += 4;
    if (content.includes(t)) score += 2;
  }

  const combined = `${title}\n${category}\n${summary}\n${content}`;
  const hits = tokens.reduce(
    (acc, t) => acc + (combined.includes(t) ? 1 : 0),
    0,
  );
  if (hits >= 2) score += 2;
  if (hits >= 4) score += 4;

  return score;
}
