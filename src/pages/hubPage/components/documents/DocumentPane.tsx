import "./docPane.scss";
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";

const CLIENT_SIDE_EXTS = new Set(["json", "txt", "md", "rtf"]);
import type { Attachment, DocumentItem, DocumentInput, DownloadFormat } from "../../../../api/documentsClient";
import {
  createDocument,
  deleteDocument,
  uploadAttachment,
  extractTextFromFile,
  downloadDocument,
} from "../../../../api/documentsClient";
import { UPLOAD_ACCEPT } from "../../../../../shared/uploadRules";
import { useStatus } from "../../../../components/statusBar/useStatus";
import { parseImportFile } from "../../utils/parseImportFile";
import { EmptyPane } from "../dialogs/EmptyPane";
import { TourOverlay } from "../dialogs/TourOverlay";
import {
  DOC_TOUR_STEPS,
  MOBILE_DOC_TOUR_STEPS,
  MOBILE_NEW_DOC_TOUR_STEPS,
  NEW_DOC_TOUR_STEPS,
} from "../dialogs/tourSteps";
import { useMobile } from "../../../../hooks/useMobile";
import { finishTour, useGuideDone } from "../../utils/guides";
import { DocumentHeader } from "./DocumentHeader";
import { DocumentEdit } from "./DocumentEdit";
import useConfirm from "../../../../hooks/useConfirm";
import { toInput, emptyInput, isSameInput, isInputValid } from "../../utils/documentForm";
import { DocumentDetailSkeleton } from "../../../../components/skeleton/Skeleton";
import { Loader } from "../../../../components/loader/Loader";
import { Maximize2 } from "lucide-react";
import { useDocumentSave } from "../../hooks/useDocumentSave";
import { useDocumentAttachments } from "../../hooks/useDocumentAttachments";
import { DISCARD_MESSAGE } from "../../hooks/useUnsavedChangesGuard";

type Props = {
  doc: DocumentItem | null;
  canEdit: boolean;
  maxContentLength?: number | undefined;
  maxAttachments?: number | undefined;
  isCreating: boolean;
  onClose?: () => void;
  onCancelCreate: () => void;
  onCreated: (doc: DocumentItem) => void;
  onSaved: (doc: DocumentItem) => void;
  onDelete?: (doc: DocumentItem) => void;
  // The delete request for this document is running.
  isDeleting?: boolean;
  hasDocs: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
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
  maxContentLength,
  maxAttachments,
  isCreating,
  onClose,
  onCancelCreate,
  onCreated,
  onSaved,
  onDelete,
  isDeleting = false,
  hasDocs,
  onDirtyChange,
  loading,
  isMaximized,
  onToggleMaximize,
  onMinimize,
  isMinimized,
  onExpand,
}: Props) {
  const status = useStatus();
  const confirm = useConfirm();
  const isPhone = useMobile();
  // Decided on mount, so a document that finishes loading later does not start a tour.
  const [opensDocument] = useState(() => !isCreating && !!doc);
  const showDocTour = !useGuideDone("doc") && opensDocument;
  const showNewDocTour = !useGuideDone("newDoc") && isCreating;
  const escapeRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const importFileRef = useRef<HTMLInputElement>(null);

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

  // An existing document always opens read-only; Edit switches to edit mode.
  const [isEditing, setIsEditing] = useState(false);

  // Reset form when navigating to a different document (avoids setState in useEffect)
  const [prevDocId, setPrevDocId] = useState(doc?.id);
  if (doc?.id !== prevDocId) {
    setPrevDocId(doc?.id);
    setIsEditing(false);
    if (!isCreating && doc) setForm(toInput(doc));
  }

  const isDirty = !isSameInput(form, baseline);
  const isValid = isInputValid(form);

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const { saveStatus, setSaveStatus, save } = useDocumentSave({
    doc,
    form,
    onSaved,
    onFormSync: setForm,
  });

  const {
    isUploading,
    uploadStatus,
    deletingAttachmentId,
    pendingFiles,
    setPendingFiles,
    addPendingFile,
    effectiveDoc,
    handleUploadAttachment,
    handleDeleteAttachment,
  } = useDocumentAttachments({ doc, canEdit, onSaved });

  // Blocks a second submit before the pending state has rendered.
  const createInFlightRef = useRef(false);

  const handleCreateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (createInFlightRef.current) return;
    if (!canEdit) {
      status.show({ kind: "error", title: "Forbidden", message: "Admins only." });
      return;
    }
    if (!isInputValid(form)) {
      status.show({ kind: "error", title: "Missing fields", message: "Please fill all fields." });
      return;
    }
    createInFlightRef.current = true;
    setSaveStatus("saving");
    try {
      const created = await createDocument(form);
      const uploaded: Attachment[] = [];
      for (const file of pendingFiles) {
        try {
          uploaded.push(await uploadAttachment(created.id, file));
        } catch (uploadErr) {
          await undoPartialCreate(created, uploaded, file, uploadErr);
          return;
        }
      }
      setPendingFiles([]);
      onCreated(pendingFiles.length > 0 ? { ...created, attachments: uploaded } : created);
      status.show({ kind: "success", message: "Document created." });
      setSaveStatus("idle");
    } catch (e) {
      setSaveStatus("error");
      const msg = e instanceof Error ? e.message : "Creation failed.";
      status.show({ kind: "error", title: "Creation failed", message: msg });
    } finally {
      createInFlightRef.current = false;
    }
  };

  // A file failed after the document was created. The document is deleted so a retry
  // does not make a second one; the form keeps its fields and files for that retry.
  // If the delete fails too, the document is kept and opened with the files that made it.
  async function undoPartialCreate(created: DocumentItem, uploaded: Attachment[], file: File, uploadErr: unknown) {
    const reason = uploadErr instanceof Error ? uploadErr.message : "Upload failed.";
    try {
      await deleteDocument(created.id);
    } catch {
      setPendingFiles([]);
      onCreated({ ...created, attachments: uploaded });
      setSaveStatus("idle");
      status.show({
        kind: "error",
        title: "Attachment failed",
        message: `Document created, but "${file.name}" was not attached. Attach it again from the document.`,
        // Stays until closed: nothing else on screen shows that the file is missing.
        timeoutMs: 0,
      });
      return;
    }
    setSaveStatus("error");
    status.show({
      kind: "error",
      title: "Creation failed",
      message: `Document was not created: "${file.name}" could not be uploaded. ${reason}`,
    });
  }

  const isCreationPending = saveStatus === "saving" && isCreating;

  const handleImportContent = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    try {
      if (CLIENT_SIDE_EXTS.has(ext)) {
        const results = await parseImportFile(file);
        const first = results[0];
        if (!first) return;
        setForm((prev) => ({
          ...prev,
          ...(first.title ? { title: first.title } : {}),
          ...(first.content ? { content: first.content } : {}),
          ...(first.category ? { category: first.category } : {}),
        }));
      } else {
        status.show({ kind: "info", message: "Extracting text…" });
        const { text, fileName } = await extractTextFromFile(file);
        if (!text) {
          status.show({ kind: "error", title: "No text found", message: "Could not extract text from this file." });
          return;
        }
        const stem = fileName.replace(/\.[^.]+$/, "");
        setForm((prev) => ({
          ...prev,
          ...(prev.title ? {} : { title: stem }),
          content: text,
        }));
        status.show({ kind: "success", message: "Text imported." });
      }
    } catch (err) {
      status.show({ kind: "error", title: "Import failed", message: err instanceof Error ? err.message : "Import failed." });
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
    if (isCreating) { onCancelCreate(); return; }
    setForm(baseline);
    setIsEditing(false);
    onMinimize?.();
  };

  const handleCancel = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: "Unsaved Changes",
        message: DISCARD_MESSAGE,
        confirmLabel: "Discard",
        cancelLabel: "Stay",
        variant: "danger",
      });
      if (!ok) return;
    }
    if (isCreating) { onCancelCreate(); return; }
    setForm(baseline);
    setIsEditing(false);
  };

  // Back to read mode only when the save holds everything, so text typed meanwhile stays editable.
  async function handleSave() {
    if (await save()) setIsEditing(false);
  }

  // Escape cancels editing without also closing the pane; in read mode it is left to
  // the hub, which closes the pane.
  useLayoutEffect(() => {
    escapeRef.current = (e) => {
      if (!isCreating) {
        if (!isEditing) return;
        e.stopImmediatePropagation();
        if (saveStatus === "saving") return;
      } else if (isCreationPending) {
        // The document may already exist on the server; let the request finish.
        e.stopImmediatePropagation();
        return;
      }
      void handleCancel();
    };
  });

  async function handleDownload(format: DownloadFormat) {
    if (!doc) return;
    try {
      const { blob, fileName } = await downloadDocument(doc.id, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      status.show({ kind: "error", title: "Download failed", message: e instanceof Error ? e.message : "Error" });
    }
  }

  useEffect(() => {
    if (!canEdit) return;
    // Capture phase, so it runs before the hub's own Escape handler on window.
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") escapeRef.current(e); };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [canEdit]);

  if (isMinimized) {
    const paneTitle = isCreating ? "New document" : (doc?.title ?? "SELECT DOCUMENT");
    return (
      <div
        className="doc-pane-minimized"
        onClick={() => onExpand && onExpand()}
        data-tooltip="Expand Document"
        data-tooltip-pos="right"
      >
        <button
          className="icon-btn expand-btn"
          onClick={(e) => { e.stopPropagation(); if (onExpand) onExpand(); }}
        >
          <Maximize2 size={16} />
        </button>
        <div className="doc-pane-rotated-title"><p>{paneTitle}</p></div>
      </div>
    );
  }

  if (!isCreating && loading) {
    return <div className="doc-pane"><DocumentDetailSkeleton canEdit={canEdit} /></div>;
  }

  if (!isCreating && !doc) {
    return <EmptyPane hasDocs={hasDocs} />;
  }

  const isSaving = saveStatus === "saving" && !isCreating;
  const headerStatus =
    saveStatus === "saving" || saveStatus === "error" ? saveStatus
    : isEditing && isDirty ? "unsaved"
    : saveStatus;

  return (
    <>
    <form
      className="doc-pane doc-pane--editing"
      onSubmit={isCreating ? handleCreateSubmit : (e) => e.preventDefault()}
      aria-busy={isCreationPending}
    >
      <DocumentHeader
        title={isCreating ? "New document" : (doc?.title ?? "")}
        isCreating={isCreating}
        onCancel={handleCancel}
        saveStatus={isCreating ? undefined : headerStatus}
        {...(canEdit && !isCreating && doc && !isEditing && { onEdit: () => setIsEditing(true) })}
        {...(canEdit && !isCreating && doc && isEditing && {
          editActions: {
            onSave: () => void handleSave(),
            onCancel: () => void handleCancel(),
            canSave: isDirty && isValid,
            isSaving,
          },
        })}
        {...(isCreating && { onImportClick: () => importFileRef.current?.click(), importDisabled: isCreationPending })}
        {...(!isCreating && doc && { onDownload: (format: DownloadFormat) => void handleDownload(format) })}
        {...(onClose ? {
          // While editing, Close cancels the edit like Cancel and Escape instead of leaving the document.
          onClose: isEditing ? () => void handleCancel() : onClose,
        } : {})}
        {...(canEdit && doc && onDelete && { onDelete: () => onDelete(doc), isDeleting })}
        {...(isMaximized !== undefined && { isMaximized })}
        {...(onToggleMaximize !== undefined && { onToggleMaximize })}
        {...(onMinimize !== undefined && { onMinimize: handleMinimize })}
      />

      {isCreating && (
        <input
          ref={importFileRef}
          type="file"
          hidden
          accept={`.json,${UPLOAD_ACCEPT}`}
          onChange={handleImportContent}
        />
      )}

      {/* Always rendered while creating, so screen readers announce when it fills. */}
      {isCreating && (
        <div
          className={`doc-pane-create-status${isCreationPending ? " doc-pane-create-status--visible" : ""}`}
          role="status"
          aria-live="polite"
        >
          {isCreationPending && (
            <>
              <Loader size={16} />
              <span>Creating document… Preparing it for search.</span>
            </>
          )}
        </div>
      )}

      <DocumentEdit
        form={form}
        onChange={setForm}
        isCreating={isCreating}
        updatedAt={doc?.updatedAt}
        doc={effectiveDoc ?? undefined}
        canEdit={canEdit}
        readOnly={(!isCreating && !isEditing) || isCreationPending}
        attachmentsDisabled={isCreationPending}
        maxContentLength={maxContentLength}
        maxAttachments={maxAttachments}
        isUploading={isUploading}
        uploadStatus={uploadStatus}
        deletingAttachmentId={deletingAttachmentId}
        pendingFiles={pendingFiles}
        onUploadAttachment={isCreating ? addPendingFile : handleUploadAttachment}
        onDeleteAttachment={isCreating
          ? (name) => setPendingFiles((prev) => prev.filter((f) => f.name !== name))
          : handleDeleteAttachment}
        initialScrollTop={0}
      />

      {canEdit && isCreating && (
        <div className={`doc-pane-save-bar${isDirty || isCreating ? " doc-pane-save-bar--visible" : ""}`}>
          <button type="button" className="doc-pane-cancel-btn" onClick={handleCancel} disabled={isCreationPending}>
            Discard
          </button>
          <button
            type="submit"
            className="primary-btn doc-pane-create-btn"
            disabled={!isDirty || !isValid || isCreationPending}
            aria-busy={isCreationPending}
          >
            {isCreationPending ? "Creating document…" : "Create"}
          </button>
        </div>
      )}
    </form>

    {showDocTour && (
      <TourOverlay
        steps={isPhone ? MOBILE_DOC_TOUR_STEPS : DOC_TOUR_STEPS}
        onDone={(outcome) => finishTour("doc", outcome)}
      />
    )}
    {showNewDocTour && (
      <TourOverlay
        steps={isPhone ? MOBILE_NEW_DOC_TOUR_STEPS : NEW_DOC_TOUR_STEPS}
        onDone={(outcome) => finishTour("newDoc", outcome)}
      />
    )}
  </>
  );
}
