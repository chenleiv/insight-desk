import React, { useMemo, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { Clock, Paperclip, ExternalLink, X } from "lucide-react";
import type { DocumentInput, DocumentItem } from "../../../api/documentsClient";
import { formatRelativeTime } from "../../../utils/relativeTime";

type Props = {
  form: DocumentInput;
  onChange: (form: DocumentInput) => void;
  isCreating: boolean;
  updatedAt?: string | undefined;
  doc?: DocumentItem | undefined;
  canEdit?: boolean;
  isUploading?: boolean;
  pendingFiles?: File[];
  onUploadAttachment?: (file: File) => void;
  onDeleteAttachment?: (attachmentId: string) => void;
};

export interface DocumentEditHandle {
  triggerAttach: () => void;
}

function useAutoResize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [value]);
  return ref;
}

export const DocumentEdit = forwardRef<DocumentEditHandle, Props>(({
  form,
  onChange,
  isCreating,
  updatedAt,
  doc,
  canEdit,
  isUploading: _isUploading,
  pendingFiles = [],
  onUploadAttachment,
  onDeleteAttachment,
}, ref) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleRef = useAutoResize(form.title);
  const summaryRef = useAutoResize(form.summary);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, []);

  useImperativeHandle(ref, () => ({
    triggerAttach: () => fileInputRef.current?.click(),
  }));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange({ ...form, [e.target.name]: e.target.value });
  };

  const timeLabel = useMemo(
    () => (isCreating ? "Just now" : formatRelativeTime(updatedAt)),
    [isCreating, updatedAt],
  );

  const existingAttachments = doc?.attachments ?? [];

  return (
    <div className="notion-doc-body notion-doc-body--edit">
      <textarea
        ref={titleRef}
        className="notion-title-input"
        name="title"
        value={form.title}
        onChange={handleChange}
        placeholder="Add title…"
        rows={1}
        autoFocus={isCreating}
        aria-label="Document title"
      />

      <div className="notion-properties">
        <input
          className="notion-category-input"
          name="category"
          value={form.category}
          onChange={handleChange}
          placeholder="Add category…"
          aria-label="Category"
          autoComplete="off"
        />
        <span className="notion-date">
          <Clock size={13} strokeWidth={2} aria-hidden />
          {timeLabel}
        </span>
      </div>

      <textarea
        ref={summaryRef}
        className="notion-summary-input"
        name="summary"
        value={form.summary}
        onChange={handleChange}
        placeholder="Add a brief summary…"
        rows={1}
        aria-label="Summary"
      />

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

      {canEdit && (existingAttachments.length > 0 || pendingFiles.length > 0) && (
        <div className="notion-att-chips">
          {existingAttachments.map((att) => (
            <span key={att._id} className="notion-att-chip">
              <Paperclip size={11} aria-hidden />
              <span className="notion-att-chip-name">{att.fileName}</span>
              <a href={att.url} target="_blank" rel="noopener noreferrer" className="notion-att-chip-action" title="Open">
                <ExternalLink size={11} />
              </a>
              <button type="button" className="notion-att-chip-action" title="Remove" onClick={() => onDeleteAttachment?.(att._id)}>
                <X size={11} />
              </button>
            </span>
          ))}
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
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        hidden
        accept=".pdf,.docx,.txt,.md,.rtf"
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
