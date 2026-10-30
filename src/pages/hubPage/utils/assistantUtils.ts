import type { ChatResponse } from "../../../api/aiClient";

export const CHAT_KEY = "assistantChat";

export function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
}

/** The documents an answer cites, each once, in order of first citation. */
export function citedSources(citations: ChatResponse["citations"]) {
  return [...new Map(citations.map((c) => [c.docId, { id: c.docId, title: c.title }])).values()];
}

/** Show chunk citations like [c1, c2] as the cited documents' titles, each once. */
export function formatCitations(answer: string, citations: ChatResponse["citations"]) {
  const titles = new Map(citations.map((c) => [c.id, c.title]));
  return answer.replace(/(\s*)\[\s*(c\d+(?:\s*,\s*c\d+)*)\s*\]/g, (_, space: string, list: string) => {
    const names = [...new Set(list.split(/\s*,\s*/).flatMap((id) => titles.get(id) ?? []))];
    return names.length ? `${space}[${names.join(", ")}]` : "";
  });
}
