import type { DocumentItem } from "../../../api/documentsClient";

export function matchesQuery(d: DocumentItem, q: string) {
  const query = q.toLowerCase().trim();
  if (!query) return true;

  const title = (d.title ?? "").toLowerCase();
  const category = (d.category ?? "").toLowerCase();
  const summary = (d.summary ?? "").toLowerCase();
  const content = (d.content ?? "").toLowerCase();

  return (
    title.includes(query) ||
    category.includes(query) ||
    summary.includes(query) ||
    content.includes(query)
  );
}
