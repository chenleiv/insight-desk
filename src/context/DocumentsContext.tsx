import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listDocuments, type DocumentItem } from "../api/documentsClient";

export const DOCUMENTS_QUERY_KEY = ["documents"] as const;

export function useDocuments() {
  // Pending means no data yet; a background refetch of cached documents keeps it false.
  const { data, isPending: loading, error, refetch } = useQuery({
    queryKey: DOCUMENTS_QUERY_KEY,
    queryFn: ({ signal }) => listDocuments(signal),
    staleTime: 1000 * 60 * 5,
  });

  return {
    docs: data ?? [],
    loading,
    error: error instanceof Error ? error.message : null,
    // Nothing to show at all, unlike a failed refresh of a list already on screen.
    loadFailed: !!error && data === undefined,
    // Back to loading while it runs. Joins a request already running instead of restarting it.
    retry: () => void refetch({ cancelRefetch: false }),
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
