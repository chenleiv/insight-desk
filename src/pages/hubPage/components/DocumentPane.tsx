import { useActionState, useState, useEffect, useMemo, useRef } from "react";
import type { DocumentItem, DocumentInput, Attachment } from "../../../api/documentsClient";
import { createDocument, updateDocument, uploadAttachment, deleteAttachment } from "../../../api/documentsClient";
import { useStatus } from "../../../components/statusBar/useStatus";
import { EmptyPane } from "./EmptyPane";
import { DocumentHeader } from "./DocumentHeader";
import { DocumentView } from "./DocumentView";
import { DocumentEdit } from "./DocumentEdit";
import type { DocumentEditHandle } from "./DocumentEdit";
import useConfirm from "../../../hooks/useConfirm";
import {
  DOCUMENT_FIELDS,
  toInput,
  emptyInput,
  isSameInput,
  isInputValid,
} from "../utils/documentForm";
import { DocumentDetailSkeleton } from "../../../components/skeleton/Skeleton";

import { Maximize2, ArrowLeft, Save, Paperclip } from "lucide-react";

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
  const editRef = useRef<DocumentEditHandle>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // Local attachment list so uploads/deletes appear instantly without waiting
  // for the React Query cache → HubPage → prop chain to complete.
  const [localAttachments, setLocalAttachments] = useState<Attachment[] | null>(null);
  const docId = doc?.id;
  useEffect(() => { setLocalAttachments(null); }, [docId]);

  // Effective doc passed down to DocumentView / DocumentEdit
  const effectiveDoc = useMemo<DocumentItem | null>(() => {
    if (!doc) return null;
    if (localAttachments === null) return doc;
    return { ...doc, attachments: localAttachments };
  }, [doc, localAttachments]);

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

  // Sync form when a different document is opened (doc.id changes)
  useEffect(() => {
    if (!isCreating && doc) {
      setForm(toInput(doc));
    }
  }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
          if (pendingFiles.length > 0) {
            setIsUploading(true);
            const uploaded: Attachment[] = [];
            for (const file of pendingFiles) {
              const att = await uploadAttachment(created.id, file);
              uploaded.push(att);
            }
            setPendingFiles([]);
            setIsUploading(false);
            onCreated({ ...created, attachments: uploaded });
          } else {
            onCreated(created);
          }
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

  const handleUploadAttachment = async (file: File) => {
    if (!doc) return;
    setIsUploading(true);
    try {
      const attachment = await uploadAttachment(doc.id, file);
      const current = localAttachments ?? doc.attachments ?? [];
      const next = [...current, attachment];
      setLocalAttachments(next);
      onSaved({ ...doc, attachments: next });
      status.show({ kind: "success", message: "File attached." });
    } catch (e) {
      status.show({ kind: "error", title: "Upload failed", message: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!doc) return;
    const ok = await confirm({
      title: "Remove attachment",
      message: "Remove this file from the document?",
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteAttachment(doc.id, attachmentId);
      const current = localAttachments ?? doc.attachments ?? [];
      const next = current.filter((a) => a._id !== attachmentId);
      setLocalAttachments(next);
      onSaved({ ...doc, attachments: next });
      status.show({ kind: "success", message: "Attachment removed." });
    } catch (e) {
      status.show({ kind: "error", title: "Delete failed", message: e instanceof Error ? e.message : "Delete failed." });
    }
  };

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

  const isEditingExisting = mode === "edit" && !isCreating;

  const isDrawer = variant === "drawer";

  return (
    <form
      className={`doc-pane ${mode === "edit" ? "doc-pane--editing" : ""} ${isDrawer ? "doc-pane--drawer" : ""} ${isEditingExisting ? "doc-pane--editing-existing" : ""}`}
      action={saveAction}
    >
      <DocumentHeader
        title=""
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
        {...(doc && onDelete && { onDelete: () => onDelete(doc) })}
        {...(isMaximized !== undefined && { isMaximized })}
        {...(onToggleMaximize !== undefined && { onToggleMaximize })}
        {...(onMinimize !== undefined && { onMinimize: handleMinimize })}
      />

      {mode === "view" ? (
        loading || !effectiveDoc ? (
          <div className="doc-pane-loading">
            <DocumentDetailSkeleton />
          </div>
        ) : (
          <DocumentView
            doc={effectiveDoc}
            canEdit={canEdit}
            isUploading={isUploading}
            onUploadAttachment={handleUploadAttachment}
            onDeleteAttachment={handleDeleteAttachment}
          />
        )
      ) : (
        <DocumentEdit
          ref={editRef}
          form={form}
          onChange={setForm}
          isCreating={isCreating}
          updatedAt={doc?.updatedAt}
          doc={effectiveDoc ?? undefined}
          canEdit={canEdit}
          isUploading={isUploading}
          pendingFiles={pendingFiles}
          onUploadAttachment={isCreating
            ? (file) => setPendingFiles((prev) => [...prev, file])
            : handleUploadAttachment}
          onDeleteAttachment={isCreating
            ? (name) => setPendingFiles((prev) => prev.filter((f) => f.name !== name))
            : handleDeleteAttachment}
        />
      )}

      {mode === "edit" && isDrawer && (
        <div className="doc-pane-modal-footer">
          {canEdit && (
            <div className="doc-pane-footer-attach">
              <button
                type="button"
                className="footer-attach-btn"
                disabled={isUploading}
                onClick={() => editRef.current?.triggerAttach()}
                title="Attach a file"
              >
                <Paperclip size={14} />
                {isUploading ? "Uploading…" : "Attach"}
              </button>
            </div>
          )}
          <div className="doc-pane-modal-footer-actions">
            <button
              type="button"
              className="doc-pane-cancel-btn"
              onClick={handleCancel}
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-btn doc-pane-save-btn--drawer"
              disabled={!canSave || isPending}
            >
              <Save size={15} strokeWidth={2} aria-hidden />
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
