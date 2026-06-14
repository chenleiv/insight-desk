import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentInput, DocumentItem } from "../../../api/documentsClient";
import { updateDocument } from "../../../api/documentsClient";
import { toInput } from "../utils/documentForm";
import { useStatus } from "../../../components/statusBar/useStatus";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type Options = {
  doc: DocumentItem | null;
  isCreating: boolean;
  form: DocumentInput;
  isDirty: boolean;
  isValid: boolean;
  onSaved: (doc: DocumentItem) => void;
  onFormSync: (input: DocumentInput) => void;
};

export function useDocumentAutosave({
  doc,
  isCreating,
  form,
  isDirty,
  isValid,
  onSaved,
  onFormSync,
}: Options) {
  const status = useStatus();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSave = useCallback(async (inputToSave: DocumentInput) => {
    if (!doc) return;
    setSaveStatus("saving");
    try {
      const updated = await updateDocument(doc.id, inputToSave);
      onSaved(updated);
      onFormSync(toInput(updated));
      setSaveStatus("saved");
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      setSaveStatus("error");
      const msg = e instanceof Error ? e.message : "Save failed.";
      status.show({ kind: "error", title: "Save failed", message: msg, timeoutMs: 0 });
    }
  }, [doc, onSaved, onFormSync, status]);

  useEffect(() => {
    if (isCreating || !doc) return;
    if (!isDirty || !isValid) return;
    const timeoutId = setTimeout(() => void performSave(form), 800);
    return () => clearTimeout(timeoutId);
  }, [form, isCreating, isDirty, isValid, doc, performSave]);

  return { saveStatus, setSaveStatus, performSave };
}
