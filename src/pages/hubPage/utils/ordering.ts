import type { DocumentItem } from "../../../api/documentsClient";

export function normalizeOrder(
  currentOrder: string[],
  docs: DocumentItem[]
): string[] {
  const docIds = new Set(docs.map((d) => d.id));
  const orderSet = new Set(currentOrder);
  const kept = currentOrder.filter((id) => docIds.has(id));
  const newIds = docs.map((d) => d.id).filter((id) => !orderSet.has(id));
  return [...newIds, ...kept];
}

export function applyOrder(
  docs: DocumentItem[],
  order: string[]
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

export function sameArray(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
