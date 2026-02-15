import { useActionState, useState, useEffect } from "react";
import type { DocumentItem, DocumentInput } from "../../../api/documentsClient";
import { createDocument, updateDocument } from "../../../api/documentsClient";
import { useStatus } from "../../../components/statusBar/useStatus";
import { EmptyPane } from "./EmptyPane";
import { DocumentHeader } from "./DocumentHeader";
import { DocumentView } from "./DocumentView";
import { DocumentEdit } from "./DocumentEdit";
import useConfirm from "../../../hooks/useConfirm";

type Props = {
  doc: DocumentItem | null;
  canEdit: boolean;
  isCreating: boolean;
  onCancelCreate: () => void;
  onCreated: (doc: DocumentItem) => void;
  onSaved: (doc: DocumentItem) => void;
  hasDocs: boolean;
  onBack?: () => void;
  showMobileHint?: boolean;
  onDismissHint?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onModeChange?: (mode: "view" | "edit") => void;
  loading?: boolean;
};

import {
  DOCUMENT_FIELDS,
  toInput,
  emptyInput,
  isSameInput,
  isInputValid,
} from "../utils/documentForm";

export default function DocumentPane({
  doc,
  canEdit,
  isCreating,
  onCancelCreate,
  onCreated,
  onSaved,
  hasDocs,
  onDirtyChange,
  onModeChange,
  loading,
}: Props) {
  const status = useStatus();
  const confirm = useConfirm();
  const [mode, setMode] = useState<"view" | "edit">(
    isCreating ? "edit" : "view",
  );

  const [form, setForm] = useState<DocumentInput>(() => {
    if (isCreating) return emptyInput();
    if (doc) return toInput(doc);
    return emptyInput();
  });

  const baseline = isCreating
    ? emptyInput()
    : doc
      ? toInput(doc)
      : emptyInput();

  const isDirty = !isSameInput(form, baseline);
  const isValid = isInputValid(form);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const [, saveAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      if (!canEdit) {
        const msg = "Admins only.";
        status.show({ kind: "error", title: "Forbidden", message: msg });
        return msg;
      }

      const cleaned: DocumentInput = DOCUMENT_FIELDS.reduce((acc, field) => {
        acc[field] = (formData.get(field) as string).trim();
        return acc;
      }, {} as DocumentInput);

      if (!isInputValid(cleaned)) {
        const msg = "Please fill all fields.";
        status.show({ kind: "error", title: "Missing fields", message: msg });
        return msg;
      }

      try {
        if (isCreating) {
          const created = await createDocument(cleaned);
          onCreated(created);
          status.show({ kind: "success", message: "Document created." });
          return null;
        }

        if (!doc) return "No document selected";

        const updated = await updateDocument(doc.id, cleaned);
        onSaved(updated);
        setForm(toInput(updated));
        setMode("view");
        status.show({ kind: "success", message: "Saved." });
        return null;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Save failed.";
        status.show({
          kind: "error",
          title: "Save failed",
          message: msg,
          timeoutMs: 0,
        });
        return msg;
      }
    },
    null,
  );

  const canSave = canEdit && !isPending && isDirty && isValid;

  const handleCancel = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: "Unsaved Changes",
        message:
          "You have unsaved changes. Are you sure you want to discard them?",
        confirmLabel: "Discard",
        cancelLabel: "Stay",
        variant: "danger",
      });
      if (!ok) return;
    }

    if (isCreating) {
      onCancelCreate();
      return;
    }
    setForm(baseline);
    setMode("view");
  };

  if (!isCreating && !doc) {
    return <EmptyPane hasDocs={hasDocs} loading={loading} />;
  }

  const paneTitle = isCreating ? "New document" : (doc?.title ?? "");
  const paneCategory = isCreating ? "" : (doc?.category ?? "");

  return (
    <form className="doc-pane" action={saveAction}>
      <DocumentHeader
        title={paneTitle}
        category={paneCategory}
        mode={mode}
        isCreating={isCreating}
        isPending={isPending}
        canEdit={canEdit}
        canSave={canSave}
        onEdit={() => setMode("edit")}
        onCancel={handleCancel}
      />

      {mode === "view" && doc ? (
        <DocumentView doc={doc} />
      ) : (
        <DocumentEdit form={form} onChange={setForm} />
      )}
    </form>
  );
}
