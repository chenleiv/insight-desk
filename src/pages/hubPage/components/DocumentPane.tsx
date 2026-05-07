import { useActionState, useState, useEffect, useMemo } from "react";
import type { DocumentItem, DocumentInput } from "../../../api/documentsClient";
import { createDocument, updateDocument } from "../../../api/documentsClient";
import { useStatus } from "../../../components/statusBar/useStatus";
import { EmptyPane } from "./EmptyPane";
import { DocumentHeader } from "./DocumentHeader";
import { DocumentView } from "./DocumentView";
import { DocumentEdit } from "./DocumentEdit";
import useConfirm from "../../../hooks/useConfirm";
import {
  DOCUMENT_FIELDS,
  toInput,
  emptyInput,
  isSameInput,
  isInputValid,
} from "../utils/documentForm";
import { DocumentDetailSkeleton } from "../../../components/skeleton/Skeleton";

import { Maximize2, ArrowLeft } from "lucide-react";

type Props = {
  doc: DocumentItem | null;
  canEdit: boolean;
  isCreating: boolean;
  variant?: "default" | "drawer";
  onClose?: () => void;
  onCancelCreate: () => void;
  onCreated: (doc: DocumentItem) => void;
  onSaved: (doc: DocumentItem) => void;
  onDelete?: (doc: DocumentItem) => void;
  hasDocs: boolean;
  onBack?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onModeChange?: (mode: "view" | "edit") => void;
  loading?: boolean;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onMinimize?: () => void;
  isMinimized?: boolean;
  onExpand?: () => void;
};

export default function DocumentPane({
  doc,
  canEdit,
  isCreating,
  variant = "default",
  onClose,
  onCancelCreate,
  onCreated,
  onSaved,
  onDelete,
  hasDocs,
  onBack,
  onDirtyChange,
  onModeChange,
  loading,
  isMaximized,
  onToggleMaximize,
  onMinimize,
  isMinimized,
  onExpand,
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

  const baseline = useMemo(() => {
    if (isCreating) return emptyInput();
    if (doc) return toInput(doc);
    return emptyInput();
  }, [isCreating, doc]);

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
        const val = formData.get(field);
        acc[field] = (typeof val === "string" ? val : "").trim();
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

  const handleMinimize = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: "Unsaved Changes",
        message: "You have unsaved changes. Minimize anyway?",
        confirmLabel: "Minimize",
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
    onMinimize?.();
  };

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

  if (isMinimized) {
    const paneTitle = isCreating
      ? "New document"
      : (doc?.title ?? "SELECT DOCUMENT");
    return (
      <div
        className="doc-pane-minimized"
        onClick={() => onExpand && onExpand()}
        data-tooltip="Expand Document"
        data-tooltip-pos="right"
      >
        <button
          className="icon-btn expand-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (onExpand) onExpand();
          }}
        >
          <Maximize2 size={16} />
        </button>
        <div className="doc-pane-rotated-title">
          <p>{paneTitle}</p>
        </div>
      </div>
    );
  }

  if (!isCreating && loading) {
    return (
      <div className="doc-pane">
        <DocumentDetailSkeleton />
      </div>
    );
  }

  if (!isCreating && !doc) {
    return <EmptyPane hasDocs={hasDocs} loading={loading} />;
  }

  const paneTitle = isCreating ? "New document" : (doc?.title ?? "");
  const paneCategory = isCreating ? "" : (doc?.category ?? "");

  const isEditingExisting = mode === "edit" && !isCreating;

  const headerTitle =
    mode === "edit"
      ? isCreating
        ? "New document"
        : ""
      : paneTitle;
  const headerCategory = mode === "edit" ? undefined : paneCategory;

  const isDrawer = variant === "drawer";

  return (
    <form
      className={`doc-pane ${mode === "edit" ? "doc-pane--editing" : ""} ${isDrawer ? "doc-pane--drawer" : ""} ${isEditingExisting ? "doc-pane--editing-existing" : ""}`}
      action={saveAction}
    >
      <DocumentHeader
        title={headerTitle}
        titleSlot={
          isEditingExisting ? (
            <input
              name="title"
              className="doc-pane-header-title-input"
              value={form.title}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="Untitled document"
              autoComplete="off"
              aria-label="Document title"
              autoFocus
            />
          ) : undefined
        }
        category={headerCategory}
        mode={mode}
        isCreating={isCreating}
        isEditingExisting={isEditingExisting}
        isPending={isPending}
        canEdit={canEdit}
        canSave={canSave}
        isDirty={mode === "edit" && isDirty}
        variant={variant}
        onEdit={() => setMode("edit")}
        onCancel={handleCancel}
        {...(isDrawer && onClose ? { onClose } : {})}
        leftAction={
          !isDrawer &&
          onBack && (
            <button
              type="button"
              className="icon-btn doc-pane-back"
              onClick={onBack}
              aria-label="Back to list"
              data-tooltip="Back to list"
              data-tooltip-pos="bottom"
            >
              <ArrowLeft size={20} />
            </button>
          )
        }
        {...(doc && onDelete && { onDelete: () => onDelete(doc) })}
        {...(isMaximized !== undefined && { isMaximized })}
        {...(onToggleMaximize !== undefined && { onToggleMaximize })}
        {...(onMinimize !== undefined && { onMinimize: handleMinimize })}
      />

      {mode === "view" ? (
        loading || !doc ? (
          <div className="doc-pane-loading">
            <DocumentDetailSkeleton />
          </div>
        ) : (
          <DocumentView doc={doc} />
        )
      ) : (
        <DocumentEdit
          form={form}
          onChange={setForm}
          isCreating={isCreating}
          updatedAt={doc?.updatedAt}
        />
      )}
    </form>
  );
}
