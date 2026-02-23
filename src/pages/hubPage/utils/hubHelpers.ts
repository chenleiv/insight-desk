import type { DocumentItem } from "../../../api/documentsClient";

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function normalizeImportedDocuments(parsed: unknown): DocumentItem[] {
  const rawArray: unknown = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.documents)
      ? parsed.documents
      : [];

  if (!Array.isArray(rawArray)) return [];

  const out: DocumentItem[] = [];

  for (const item of rawArray) {
    if (!isRecord(item)) continue;

    const title = asString(item.title);
    const category = asString(item.category);
    const summary = asString(item.summary);
    const content = asString(item.content);

    const id = asNumber(item.id) ?? Date.now() + out.length;

    if (!title || !category || !summary || !content) continue;

    out.push({ id, title, category, summary, content });
  }

  return out;
}
