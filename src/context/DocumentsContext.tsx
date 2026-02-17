import { createContext, useContext } from "react";
import { type DocumentItem } from "../api/documentsClient";

interface DocumentsContextType {
  docs: DocumentItem[];
  loading: boolean;
  error: string | null;
  isReady: boolean;
  loadDocuments: (force?: boolean) => Promise<void>;
  setDocs: React.Dispatch<React.SetStateAction<DocumentItem[]>>;
}

export const DocumentsContext = createContext<DocumentsContextType | undefined>(
  undefined,
);

const CACHE_KEY = "docsCache:v1";
const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 6; // 6 hours

export type CachePayload = {
  savedAt: number;
  docs: DocumentItem[];
};

export function readCache(): DocumentItem[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachePayload;
    if (!parsed?.savedAt || !Array.isArray(parsed.docs)) return null;
    if (Date.now() - parsed.savedAt > CACHE_MAX_AGE_MS) return null;
    return parsed.docs;
  } catch {
    return null;
  }
}

export function writeCache(docs: DocumentItem[]) {
  try {
    const payload: CachePayload = { savedAt: Date.now(), docs };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function useDocuments() {
  const context = useContext(DocumentsContext);
  if (!context)
    throw new Error("useDocuments must be used within a DocumentsProvider");
  return context;
}
