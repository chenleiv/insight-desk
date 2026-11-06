import { useQuery } from "@tanstack/react-query";
import { getSuggestions } from "../../../api/aiClient";

export const SUGGESTIONS_QUERY_KEY = ["suggestions"] as const;

// Only an admin changes these, rarely, and the chat view remounts on every entry.
const SUGGESTIONS_CACHE_MS = 1000 * 60 * 60;

export function useSuggestions() {
  return useQuery({
    queryKey: SUGGESTIONS_QUERY_KEY,
    queryFn: ({ signal }) => getSuggestions(signal),
    staleTime: SUGGESTIONS_CACHE_MS,
    // Also kept while no view uses them; the default of 5 minutes would refetch on a later entry.
    gcTime: SUGGESTIONS_CACHE_MS,
    // The view can do without questions, and retrying would spend more of the API limit.
    retry: false,
  });
}
