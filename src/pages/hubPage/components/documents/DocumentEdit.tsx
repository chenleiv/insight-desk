import "./notionEditor.scss";
import React, { useMemo, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { Clock, Paperclip, ExternalLink, X, Plus } from "lucide-react";
import type { DocumentInput, DocumentItem } from "../../../../api/documentsClient";
import { formatRelativeTime } from "../../../../utils/relativeTime";

type Props = {
  form: DocumentInput;
  onChange: (form: DocumentInput) => void;
  isCreating: boolean;
  updatedAt?: string | undefined;
  doc?: DocumentItem | undefined;
  canEdit?: boolean;
  isUploading?: boolean;
  deletingAttachmentId?: string | null;
  pendingFiles?: File[];
  onUploadAttachment?: (file: File) => void;
  onDeleteAttachment?: (attachmentId: string) => void;

  initialScrollTop?: number;
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
  isUploading = false,
  deletingAttachmentId = null,
  pendingFiles = [],
  onUploadAttachment,
  onDeleteAttachment,

  initialScrollTop = 0,
}, ref) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: initialScrollTop });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    triggerAttach: () => fileInputRef.current?.click(),
  }));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    onChange({ ...form, [e.target.name]: e.target.value });
  };


  const timeLabel = useMemo(
    () => (isCreating ? "Just now" : formatRelativeTime(updatedAt)),
    [isCreating, updatedAt],
  );

  const existingAttachments = doc?.attachments ?? [];

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
            aria-label="Category"
            maxLength={60}
          />
        </div>
        <span className="notion-date">
          <Clock size={13} strokeWidth={2} aria-hidden />
          {timeLabel}
        </span>
      </div>

      {canEdit && (
        <div className="notion-att-chips">
          {existingAttachments.map((att) => {
            const isDeleting = deletingAttachmentId === att._id;
            return (
              <span key={att._id} className="notion-att-chip">
                <Paperclip size={11} aria-hidden />
                <span className="notion-att-chip-name">{att.fileName}</span>
                <a href={att.url} target="_blank" rel="noopener noreferrer" className="notion-att-chip-action" title="Open">
                  <ExternalLink size={11} />
                </a>
                <button
                  type="button"
                  className="notion-att-chip-action"
                  title="Remove"
                  disabled={isDeleting}
                  onClick={() => onDeleteAttachment?.(att._id)}
                >
                  {isDeleting ? <span className="notion-att-spinner" /> : <X size={11} />}
                </button>
              </span>
            );
          })}
          {pendingFiles.map((f) => (
            <span key={f.name} className="notion-att-chip notion-att-chip--pending">
              <Paperclip size={11} aria-hidden />
              <span className="notion-att-chip-name">{f.name}</span>
              <span className="notion-att-chip-badge">on save</span>
              <button type="button" className="notion-att-chip-action" title="Remove" onClick={() => onDeleteAttachment?.(f.name)}>
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
