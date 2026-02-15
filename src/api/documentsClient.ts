import { apiFetch } from "./base";

export type DocumentItem = {
  id: number;
  title: string;
  category: string;
  summary: string;
  content: string;
};

export type DocumentInput = Omit<DocumentItem, "id">;

export function listDocuments() {
  return apiFetch<DocumentItem[]>("/api/documents");
}

export function getDocument(id: number) {
  return apiFetch<DocumentItem>(`/api/documents/${id}`);
}

// admin only
export function createDocument(input: DocumentInput) {
  return apiFetch<DocumentItem>("/api/documents", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// admin only
export function updateDocument(id: number, input: DocumentInput) {
  return apiFetch<DocumentItem>(`/api/documents/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

// admin only
export async function deleteDocument(id: number) {
  await apiFetch<void>(`/api/documents/${id}`, { method: "DELETE" });
  return { ok: true as const };
}

// viewer/admin
export function exportDocuments() {
  return apiFetch<DocumentItem[]>("/api/documents/export", { method: "POST" });
}

// admin only
export function importDocumentsBulk(payload: {
  mode: "merge" | "replace";
  documents: DocumentItem[];
}) {
  return apiFetch<{ inserted: number; mode: "merge" | "replace" }>(
    "/api/documents/import-bulk",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function toggleFavorite(id: string | number) {
  return apiFetch<{ favorites: string[] }>(
    `/api/documents/${id}/toggle-favorite`,
    {
      method: "POST",
    },
  );
}
