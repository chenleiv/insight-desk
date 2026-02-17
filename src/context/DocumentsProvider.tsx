import React, { useState, useCallback, useEffect, useRef } from "react";
import { listDocuments, type DocumentItem } from "../api/documentsClient";
import { DocumentsContext, readCache, writeCache } from "./DocumentsContext";

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
