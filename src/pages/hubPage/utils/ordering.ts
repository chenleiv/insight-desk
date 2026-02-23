import type { DocumentItem } from "../../../api/documentsClient";

export function normalizeOrder(
  currentOrder: number[],
  docs: DocumentItem[]
): number[] {
  const ids = docs.map((d) => d.id);
  const next = currentOrder.filter((id) => ids.includes(id));
  for (const id of ids) if (!next.includes(id)) next.push(id);
  return next;
}

export function applyOrder(
  docs: DocumentItem[],
  order: number[]
): DocumentItem[] {
  if (!order.length) return docs;

  const map = new Map(docs.map((d) => [d.id, d]));
  const ordered: DocumentItem[] = [];

  for (const id of order) {
    const doc = map.get(id);
    if (doc) ordered.push(doc);
  }

  for (const d of docs) {
    if (!order.includes(d.id)) ordered.push(d);
  }

  return ordered;
}

export function makePreview(doc: DocumentItem, max = 160) {
  const base = (doc.summary || doc.content || "").replace(/\s+/g, " ").trim();
  if (!base) return "";
  return base.length > max ? base.slice(0, max) + "…" : base;
}

export function sameArray(a: number[], b: number[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
