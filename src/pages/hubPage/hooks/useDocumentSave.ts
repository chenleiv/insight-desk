import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { DocumentInput, DocumentItem } from "../../../api/documentsClient";
import { updateDocument } from "../../../api/documentsClient";
import { toInput, isSameInput, isInputValid } from "../utils/documentForm";
import { useStatus } from "../../../components/statusBar/useStatus";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type Options = {
  doc: DocumentItem | null;
  form: DocumentInput;
  onSaved: (doc: DocumentItem) => void;
  onFormSync: (input: DocumentInput) => void;
};

/**
 * Saves the form when the user asks. Each save rebuilds the document's chunks on the
 * server, so only one save runs at a time: a save asked for meanwhile waits for it.
 */
export function useDocumentSave({ doc, form, onSaved, onFormSync }: Options) {
  const status = useStatus();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const savedInputRef = useRef<DocumentInput | null>(null);
  const latestRef = useRef({ form, onSaved, onFormSync, status });
  useLayoutEffect(() => { latestRef.current = { form, onSaved, onFormSync, status }; });
  useLayoutEffect(() => { savedInputRef.current = doc ? toInput(doc) : null; }, [doc]);

  const docId = doc?.id;

  const send = useCallback((input: DocumentInput): Promise<boolean> => {
    if (!docId) return Promise.resolve(false);
    setSaveStatus("saving");
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const run = async () => {
      try {
        const updated = await updateDocument(docId, input);
        const saved = toInput(updated);
        savedInputRef.current = saved;
        latestRef.current.onSaved(updated);
        // Take the server's values only when nothing was typed during the save.
        if (latestRef.current.form === input) latestRef.current.onFormSync(saved);
        setSaveStatus("saved");
        saveTimeoutRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
        return true;
      } catch (e) {
        setSaveStatus("error");
        const msg = e instanceof Error ? e.message : "Save failed.";
        latestRef.current.status.show({ kind: "error", title: "Save failed", message: msg, timeoutMs: 0 });
        return false;
      } finally {
        inFlightRef.current = null;
      }
    };
    const pending = run();
    inFlightRef.current = pending;
    return pending;
  }, [docId]);

  /** Save the latest form, after any save in flight. Resolves true when nothing is left unsaved. */
  const save = useCallback(async (): Promise<boolean> => {
    if (inFlightRef.current) await inFlightRef.current;
    const current = latestRef.current.form;
    if (savedInputRef.current && isSameInput(current, savedInputRef.current)) return true;
    if (!isInputValid(current)) {
      latestRef.current.status.show({ kind: "error", title: "Missing fields", message: "Please fill all fields." });
      return false;
    }
    const ok = await send(current);
    // Text typed during the save is not in it.
    return ok && latestRef.current.form === current;
  }, [send]);

  return { saveStatus, setSaveStatus, save };
}
