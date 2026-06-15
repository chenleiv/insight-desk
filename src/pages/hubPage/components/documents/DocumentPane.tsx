import "./docPane.scss";
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { DocumentItem, DocumentInput } from "../../../../api/documentsClient";
import { createDocument, uploadAttachment, extractTextFromFile } from "../../../../api/documentsClient";
import { useStatus } from "../../../../components/statusBar/useStatus";
import { parseImportFile } from "../../utils/parseImportFile";
import { EmptyPane } from "../dialogs/EmptyPane";
import { TourOverlay, DOC_TOUR_STEPS, NEW_DOC_TOUR_STEPS } from "../dialogs/TourOverlay";
import { DocumentHeader } from "./DocumentHeader";
import { DocumentEdit } from "./DocumentEdit";
import type { DocumentEditHandle } from "./DocumentEdit";
import useConfirm from "../../../../hooks/useConfirm";
import { toInput, emptyInput, isSameInput, isInputValid } from "../../utils/documentForm";
import { DocumentDetailSkeleton } from "../../../../components/skeleton/Skeleton";
import { Loader } from "../../../../components/loader/Loader";
import { Maximize2, Save, Paperclip } from "lucide-react";
import { useDocumentAutosave } from "../../hooks/useDocumentAutosave";
import { useDocumentAttachments } from "../../hooks/useDocumentAttachments";

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
  isCreating,
  variant = "default",
  onClose,
  onCancelCreate,
  onCreated,
  onSaved,
  onDelete,
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
  const [showDocTour, setShowDocTour] = useState(() =>
    !isCreating && !!doc && !localStorage.getItem("insight-desk:doc-toured")
  );
  const [showNewDocTour, setShowNewDocTour] = useState(() =>
    isCreating && !localStorage.getItem("insight-desk:new-doc-toured")
  );
  const editRef = useRef<DocumentEditHandle>(null);
  const cancelRef = useRef<() => Promise<void>>(async () => {});
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

  // Reset form when navigating to a different document (avoids setState in useEffect)
  const [prevDocId, setPrevDocId] = useState(doc?.id);
  if (doc?.id !== prevDocId) {
    setPrevDocId(doc?.id);
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

  const { saveStatus, setSaveStatus } = useDocumentAutosave({
    doc,
    isCreating,
    form,
    isDirty,
    isValid,
    onSaved,
    onFormSync: setForm,
  });

  const {
    isUploading,
    deletingAttachmentId,
    pendingFiles,
    setPendingFiles,
    effectiveDoc,
    handleUploadAttachment,
    handleDeleteAttachment,
  } = useDocumentAttachments({ doc, canEdit, onSaved });

  const handleCreateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEdit) {
      status.show({ kind: "error", title: "Forbidden", message: "Admins only." });
      return;
    }
    if (!isInputValid(form)) {
      status.show({ kind: "error", title: "Missing fields", message: "Please fill all fields." });
      return;
    }
    setSaveStatus("saving");
    try {
      const created = await createDocument(form);
      if (pendingFiles.length > 0) {
        const uploaded = [];
        for (const file of pendingFiles) {
          uploaded.push(await uploadAttachment(created.id, file));
        }
        setPendingFiles([]);
        onCreated({ ...created, attachments: uploaded });
      } else {
        onCreated(created);
      }
      status.show({ kind: "success", message: "Document created." });
      setSaveStatus("idle");
    } catch (e) {
      setSaveStatus("error");
      const msg = e instanceof Error ? e.message : "Creation failed.";
      status.show({ kind: "error", title: "Creation failed", message: msg, timeoutMs: 0 });
    }
  };

  const isCreationPending = saveStatus === "saving" && isCreating;

  const CLIENT_SIDE_EXTS = new Set(["json", "txt", "md", "rtf"]);

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
    onMinimize?.();
  };

  const handleCancel = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: "Unsaved Changes",
        message: "You have unsaved changes. Are you sure you want to discard them?",
        confirmLabel: "Discard",
        cancelLabel: "Stay",
        variant: "danger",
      });
      if (!ok) return;
    }
    if (isCreating) { onCancelCreate(); return; }
    setForm(baseline);
  };

  useLayoutEffect(() => { cancelRef.current = handleCancel; });

  function handleExport() {
    if (!doc) return;
    const md = `# ${doc.title}\n\n${form.content}`;
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.title.replace(/[^\w\s-]/g, "").trim() || "document"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") void cancelRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
    return <div className="doc-pane"><DocumentDetailSkeleton /></div>;
  }

  if (!isCreating && !doc) {
    return <EmptyPane hasDocs={hasDocs} loading={loading} />;
  }

  const isDrawer = variant === "drawer";

  return (
    <>
    <form
      className={`doc-pane doc-pane--editing ${isDrawer ? "doc-pane--drawer" : ""}`}
      onSubmit={isCreating ? handleCreateSubmit : (e) => e.preventDefault()}
    >
      <DocumentHeader
        title={isCreating ? "New document" : (doc?.title ?? "")}
        category={doc?.category}
        isCreating={isCreating}
        variant={variant}
        onCancel={handleCancel}
        saveStatus={isCreating ? undefined : saveStatus}
        {...(isCreating && { onImportClick: () => importFileRef.current?.click() })}
        {...(!isCreating && doc && { onExport: handleExport })}
        {...(onClose ? { onClose } : {})}
        {...(canEdit && doc && onDelete && { onDelete: () => onDelete(doc) })}
        {...(isMaximized !== undefined && { isMaximized })}
        {...(onToggleMaximize !== undefined && { onToggleMaximize })}
        {...(onMinimize !== undefined && { onMinimize: handleMinimize })}
      />

      {isCreating && (
        <input
          ref={importFileRef}
          type="file"
          hidden
          accept=".json,.txt,.md,.rtf,.pdf,.docx,.xlsx,.xls"
          onChange={handleImportContent}
        />
      )}

      <DocumentEdit
        ref={editRef}
        form={form}
        onChange={setForm}
        isCreating={isCreating}
        updatedAt={doc?.updatedAt}
        doc={effectiveDoc ?? undefined}
        canEdit={canEdit}
        isUploading={isUploading}
        deletingAttachmentId={deletingAttachmentId}
        pendingFiles={pendingFiles}
        onUploadAttachment={isCreating
          ? (file) => setPendingFiles((prev) => [...prev, file])
          : handleUploadAttachment}
        onDeleteAttachment={isCreating
          ? (name) => setPendingFiles((prev) => prev.filter((f) => f.name !== name))
          : handleDeleteAttachment}
        {...(canEdit && { onUseAttachmentText: (text: string) => setForm((prev) => ({ ...prev, content: text })) })}
        initialScrollTop={0}
      />

      {canEdit && isCreating && !isDrawer && (
        <div className={`doc-pane-save-bar${isDirty || isCreating ? " doc-pane-save-bar--visible" : ""}`}>
          {isCreationPending && <Loader size={16} />}
          <button type="button" className="doc-pane-cancel-btn" onClick={handleCancel} disabled={isCreationPending}>
            Discard
          </button>
          <button type="submit" className="primary-btn" disabled={!isDirty || !isValid || isCreationPending}>
            {isCreationPending ? "Creating…" : "Create"}
          </button>
        </div>
      )}

      {canEdit && isCreating && isDrawer && (
        <div className="doc-pane-modal-footer">
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
          <div className="doc-pane-modal-footer-actions">
            <button type="button" className="doc-pane-cancel-btn" onClick={handleCancel} disabled={isCreationPending}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary-btn doc-pane-save-btn--drawer"
              disabled={!isDirty || !isValid || isCreationPending}
            >
              <Save size={15} strokeWidth={2} aria-hidden />
              {isCreationPending ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}
    </form>

    {showDocTour && (
      <TourOverlay
        steps={DOC_TOUR_STEPS}
        onDone={() => {
          localStorage.setItem("insight-desk:doc-toured", "1");
          setShowDocTour(false);
        }}
      />
    )}
    {showNewDocTour && (
      <TourOverlay
        steps={NEW_DOC_TOUR_STEPS}
        onDone={() => {
          localStorage.setItem("insight-desk:new-doc-toured", "1");
          setShowNewDocTour(false);
        }}
      />
    )}
  </>
  );
}
