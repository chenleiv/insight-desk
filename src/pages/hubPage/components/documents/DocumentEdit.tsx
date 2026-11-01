import "./notionEditor.scss";
import React, { useMemo, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { Clock, Paperclip, ExternalLink, X, Plus, Lock } from "lucide-react";
import type { DocumentInput, DocumentItem } from "../../../../api/documentsClient";
import { formatRelativeTime } from "../../../../utils/relativeTime";
import { attachmentHref } from "../../utils/attachmentLink";
import type { UploadStatus } from "../../hooks/useDocumentAttachments";

type Props = {
  form: DocumentInput;
  onChange: (form: DocumentInput) => void;
  isCreating: boolean;
  updatedAt?: string | undefined;
  doc?: DocumentItem | undefined;
  canEdit?: boolean;
  // Read mode for a user who may edit: fields locked. Attachments can still be added and
  // removed, since each is saved on its own and not with the form.
  readOnly?: boolean;
  // Locks adding and removing attachments, e.g. while the document is being created.
  attachmentsDisabled?: boolean;
  isUploading?: boolean;
  uploadStatus?: UploadStatus | null;
  deletingAttachmentId?: string | null;
  pendingFiles?: File[];
  onUploadAttachment?: (file: File) => void;
  onDeleteAttachment?: (attachmentId: string) => void;
  maxContentLength?: number | undefined;
  maxAttachments?: number | undefined;

  initialScrollTop?: number;
};

const UPLOAD_STATUS_TEXT: Record<UploadStatus["state"], (name: string) => string> = {
  uploading: (name) => `Uploading ${name}…`,
  done: (name) => `${name} attached.`,
  failed: (name) => `Upload of ${name} failed.`,
};

export interface DocumentEditHandle {
  triggerAttach: () => void;
}

export const DocumentEdit = forwardRef<DocumentEditHandle, Props>(({
  form,
  onChange,
  isCreating,
  updatedAt,
  doc,
  canEdit,
  readOnly = false,
  attachmentsDisabled = false,
  isUploading = false,
  uploadStatus = null,
  deletingAttachmentId = null,
  pendingFiles = [],
  onUploadAttachment,
  onDeleteAttachment,
  maxContentLength,
  maxAttachments,

  initialScrollTop = 0,
}, ref) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: initialScrollTop });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const editable = !!canEdit && !readOnly;
  const existingAttachments = doc?.attachments ?? [];
  const removingAttachment = existingAttachments.find((att) => att._id === deletingAttachmentId) ?? null;
  const attachmentStatusText = removingAttachment ? `Removing ${removingAttachment.fileName}…`
    : uploadStatus ? UPLOAD_STATUS_TEXT[uploadStatus.state](uploadStatus.fileName)
    : "";
  const attachLimitReached =
    maxAttachments !== undefined && existingAttachments.length + pendingFiles.length >= maxAttachments;

  useImperativeHandle(ref, () => ({
    triggerAttach: () => { if (!attachLimitReached && !attachmentsDisabled) fileInputRef.current?.click(); },
  }));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    onChange({ ...form, [e.target.name]: e.target.value });
  };


  const timeLabel = useMemo(
    () => (isCreating ? "Just now" : formatRelativeTime(updatedAt)),
    [isCreating, updatedAt],
  );


  return (
    <div ref={bodyRef} className="notion-doc-body notion-doc-body--edit">
      <input
        className="notion-title-input"
        type="text"
        name="title"
        value={form.title}
        onChange={handleChange}
        placeholder="Untitled…"
        autoFocus={isCreating}
        readOnly={!editable}
        aria-label="Title"
        title={form.title || undefined}
      />
      <div className="notion-properties">
        <div
          className="notion-category-wrapper"
          data-value={form.category || "Category…"}
        >
          <input
            className="notion-category-input"
            name="category"
            value={form.category}
            onChange={handleChange}
            placeholder="Category…"
            readOnly={!editable}
            aria-label="Category"
            maxLength={60}
          />
        </div>
        <span className="notion-date">
          <Clock size={13} strokeWidth={2} aria-hidden />
          {timeLabel}
        </span>
        {!canEdit && (
          <span className="notion-readonly-badge" title="Only admins can edit documents">
            <Lock size={11} aria-hidden />
            View only · Admin edits
          </span>
        )}
      </div>

      {!canEdit && existingAttachments.length > 0 && (
        <div className="notion-att-chips">
          {existingAttachments.map((att) => {
            const href = doc ? attachmentHref(doc.id, att) : null;
            return (
              <span key={att._id} className="notion-att-chip">
                <Paperclip size={11} aria-hidden />
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="notion-att-chip-name" title={`Open ${att.fileName}`}>
                    {att.fileName}
                  </a>
                ) : (
                  <span className="notion-att-chip-name">{att.fileName}</span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {canEdit && (
        <div className="notion-att-chips">
          {/* Always rendered, so screen readers announce when it fills. */}
          <span className="notion-att-sr-status" role="status" aria-live="polite">
            {attachmentStatusText}
          </span>
          {existingAttachments.map((att) => {
            const isDeleting = deletingAttachmentId === att._id;
            const href = doc ? attachmentHref(doc.id, att) : null;
            return (
              <span key={att._id} className={`notion-att-chip${isDeleting ? " notion-att-chip--removing" : ""}`}>
                {isDeleting ? <span className="notion-att-spinner" aria-hidden /> : <Paperclip size={11} aria-hidden />}
                <span className="notion-att-chip-name">{att.fileName}</span>
                {isDeleting && <span className="notion-att-chip-badge">Removing…</span>}
                {href && !isDeleting && (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="notion-att-chip-action" title="Open">
                    <ExternalLink size={11} />
                  </a>
                )}
                {/* One removal at a time: each removal builds on the list the previous one left. */}
                <button
                  type="button"
                  className="notion-att-chip-action"
                  title="Remove"
                  disabled={deletingAttachmentId !== null || attachmentsDisabled}
                  onClick={() => onDeleteAttachment?.(att._id)}
                >
                  <X size={11} />
                </button>
              </span>
            );
          })}
          {pendingFiles.map((f) => (
            <span key={f.name} className="notion-att-chip notion-att-chip--pending">
              <Paperclip size={11} aria-hidden />
              <span className="notion-att-chip-name">{f.name}</span>
              <span className="notion-att-chip-badge">on save</span>
              <button type="button" className="notion-att-chip-action" title="Remove" disabled={attachmentsDisabled} onClick={() => onDeleteAttachment?.(f.name)}>
                <X size={11} />
              </button>
            </span>
          ))}
          {isUploading ? (
            <span className="notion-att-chip notion-att-chip--uploading">
              <span className="notion-att-spinner" />
              Uploading…
            </span>
          ) : (
            <button
              type="button"
              className="notion-att-chip notion-att-chip--add"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachLimitReached || attachmentsDisabled}
              title={attachLimitReached ? `Demo limit: ${maxAttachments} file per document` : undefined}
            >
              <Plus size={11} aria-hidden />
              Add file
            </button>
          )}
        </div>
      )}

      <hr className="notion-divider" />

      <textarea
        className="notion-content-input"
        name="content"
        value={form.content}
        onChange={handleChange}
        placeholder="Start writing…"
        rows={8}
        readOnly={!editable}
        maxLength={maxContentLength}
        aria-label="Content"
      />

      <input
        ref={fileInputRef}
        type="file"
        hidden
        accept=".pdf,.docx,.xlsx,.xls,.txt,.md,.rtf"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUploadAttachment?.(file);
          e.target.value = "";
        }}
      />
    </div>
  );
});

DocumentEdit.displayName = "DocumentEdit";
