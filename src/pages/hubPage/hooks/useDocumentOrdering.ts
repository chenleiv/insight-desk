import { useMemo, useState } from "react";
import type { DocumentItem } from "../../../api/documentsClient";
import { normalizeOrder, applyOrder, sameArray } from "../utils/ordering";
import { loadJson, saveJson } from "../../../utils/storage";

export function useDocumentOrdering(docs: DocumentItem[], orderKey: string) {
  const [order, setOrder] = useState<string[]>(() => loadJson<string[]>(orderKey, []));
  const [prevDocs, setPrevDocs] = useState<DocumentItem[]>(docs);

  // Adjust order when docs change during render (React's "adjusting state" pattern)
  if (docs !== prevDocs) {
    setPrevDocs(docs);
    if (docs.length > 0) {
      const next = normalizeOrder(order, docs);
      if (!sameArray(next, order)) {
        setOrder(next);
        saveJson(orderKey, next);
      }
    }
  }

  const orderedDocs = useMemo(() => applyOrder(docs, order), [docs, order]);

  return { orderedDocs, setOrder };
}
