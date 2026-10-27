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
