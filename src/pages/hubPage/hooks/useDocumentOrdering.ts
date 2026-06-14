import { useEffect, useMemo, useState } from "react";
import type { DocumentItem } from "../../../api/documentsClient";
import { normalizeOrder, applyOrder, sameArray } from "../utils/ordering";
import { saveJson } from "../../../utils/storage";

export function useDocumentOrdering(docs: DocumentItem[], orderKey: string) {
  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => {
    if (docs.length > 0) {
      setOrder((prev) => {
        const next = normalizeOrder(prev, docs);
        if (!sameArray(next, prev)) saveJson(orderKey, next);
        return next;
      });
    }
  }, [docs, orderKey]);

  const orderedDocs = useMemo(() => applyOrder(docs, order), [docs, order]);

  return { orderedDocs, setOrder };
}
