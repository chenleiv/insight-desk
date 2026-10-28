import { useQuery } from "@tanstack/react-query";
import { getQualitySummary, type QualityDays } from "../../../api/aiClient";

export function useQualitySummary(days: QualityDays) {
  return useQuery({
    queryKey: ["qualitySummary", days],
    queryFn: () => getQualitySummary(days),
    staleTime: 1000 * 60,
  });
}
