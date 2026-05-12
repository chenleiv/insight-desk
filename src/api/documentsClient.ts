import { apiFetch } from "./base";
import { getApiBase } from "./config";

export async function uploadAttachment(docId: number | string, file: File): Promise<Attachment> {
  const base = getApiBase();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${base}/api/documents/${docId}/attachments`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Upload failed: ${res.status}`);
  }
  return res.json() as Promise<Attachment>;
}

export async function deleteAttachment(docId: number | string, attachmentId: string): Promise<void> {
  await apiFetch<void>(`/api/documents/${docId}/attachments/${attachmentId}`, { method: "DELETE" });
}

export type Attachment = {
  _id: string;
  url: string;
  fileName: string;
  fileType: string;
  extractedText?: string;
};

export type DocumentItem = {
  id: number;
  title: string;
  category: string;
  summary: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
  attachments?: Attachment[];
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

// admin only
export function exportDocuments() {
  return apiFetch<DocumentItem[]>("/api/documents/export");
}

// admin only
export function importDocumentsBulk(payload: {
  mode: "append" | "replace";
  documents: Omit<DocumentItem, "id">[];
}) {
  return apiFetch<{ inserted: number; mode: "append" | "replace" }>(
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
