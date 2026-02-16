import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { listDocuments, type DocumentItem } from "../api/documentsClient";

interface DocumentsContextType {
  docs: DocumentItem[];
  loading: boolean;
  error: string | null;
  isReady: boolean;
  loadDocuments: (force?: boolean) => Promise<void>;
  setDocs: React.Dispatch<React.SetStateAction<DocumentItem[]>>;
}

const DocumentsContext = createContext<DocumentsContextType | undefined>(
  undefined,
);

const CACHE_KEY = "docsCache:v1";
const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 6; // 6 hours

type CachePayload = {
  savedAt: number;
  docs: DocumentItem[];
};

function readCache(): DocumentItem[] | null {
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

function writeCache(docs: DocumentItem[]) {
  try {
    const payload: CachePayload = { savedAt: Date.now(), docs };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function DocumentsProvider({ children }: { children: React.ReactNode }) {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const didFetchOnceRef = useRef(false);

  useEffect(() => {
    const cached = readCache();
    if (cached && cached.length) {
      setDocs(cached);
      setIsReady(true);
    }
  }, []);

  const loadDocuments = useCallback(async (force = false) => {
    if (!force && didFetchOnceRef.current) return;

    setLoading(true);
    setError(null);

    try {
      const data = await listDocuments();
      setDocs(data);
      writeCache(data);
      setIsReady(true);
      didFetchOnceRef.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <DocumentsContext.Provider
      value={{ docs, loading, error, isReady, loadDocuments, setDocs }}
    >
      {children}
    </DocumentsContext.Provider>
  );
}

export function useDocuments() {
  const context = useContext(DocumentsContext);
  if (!context)
    throw new Error("useDocuments must be used within a DocumentsProvider");
  return context;
}
