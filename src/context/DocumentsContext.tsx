import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listDocuments, type DocumentItem } from "../api/documentsClient";

export const DOCUMENTS_QUERY_KEY = ["documents"] as const;

export function useDocuments() {
  const { data: docs = [], isLoading: loading, error } = useQuery({
    queryKey: DOCUMENTS_QUERY_KEY,
    queryFn: listDocuments,
    staleTime: 1000 * 60 * 5,
  });

  return {
    docs,
    loading,
    error: error instanceof Error ? error.message : null,
  };
}

export function useSetDocs() {
  const queryClient = useQueryClient();
  return (updater: DocumentItem[] | ((prev: DocumentItem[]) => DocumentItem[])) => {
    queryClient.setQueryData<DocumentItem[]>(
      DOCUMENTS_QUERY_KEY,
      typeof updater === "function"
        ? (prev) => updater(prev ?? [])
        : updater,
    );
  };
}
