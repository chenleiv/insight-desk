import { apiFetch, ApiError } from "./base";
import { getApiBase } from "./config";

export async function uploadAttachment(docId: string, file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<Attachment>(`/api/documents/${docId}/attachments`, {
    method: "POST",
    body: formData,
  });
}

export async function deleteAttachment(docId: string, attachmentId: string): Promise<void> {
  await apiFetch<void>(`/api/documents/${docId}/attachments/${attachmentId}`, { method: "DELETE" });
}

export type Attachment = {
  _id: string;
  url: string;
  gridfsId?: string | null;
  fileName: string;
  fileType: string;
  extractedText?: string;
};

export type DocumentItem = {
  id: string;
  title: string;
  category: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
  attachments?: Attachment[];
};

export type DocumentInput = Omit<DocumentItem, "id">;

export function listDocuments() {
  return apiFetch<DocumentItem[]>("/api/documents");
}

// admin only
export function createDocument(input: DocumentInput) {
  return apiFetch<DocumentItem>("/api/documents", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// admin only
export function updateDocument(id: string, input: DocumentInput) {
  return apiFetch<DocumentItem>(`/api/documents/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

// admin only
export async function deleteDocument(id: string) {
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


export function extractTextFromFile(file: File): Promise<{ text: string; fileName: string }> {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<{ text: string; fileName: string }>("/api/documents/extract-text", {
    method: "POST",
    body: formData,
  });
}

export type DownloadFormat = "md" | "pdf" | "docx";

// The server cleans the file name; this only reads it back from Content-Disposition.
export function fileNameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch { /* malformed encoding: try the plain name */ }
  }
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? fallback;
}

export async function downloadDocument(id: string, format: DownloadFormat) {
  const res = await fetch(`${getApiBase()}/api/documents/${id}/download?format=${format}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text();
    let message = `Download failed: ${res.status}`;
    try {
      const body = JSON.parse(text);
      if (body?.detail) message = body.detail;
    } catch { /* non-JSON error body */ }
    throw new ApiError(message, res.status, text || undefined);
  }
  return {
    blob: await res.blob(),
    fileName: fileNameFromDisposition(res.headers.get("Content-Disposition"), `document.${format}`),
  };
}

export function toggleFavorite(id: string) {
  return apiFetch<{ favorites: string[] }>(
    `/api/documents/${id}/toggle-favorite`,
    {
      method: "POST",
    },
  );
}
