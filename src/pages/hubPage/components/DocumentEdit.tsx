import React, { useMemo, useRef, useEffect } from "react";
import { Clock, Paperclip, ExternalLink, X, Plus } from "lucide-react";
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


export const DocumentEdit: React.FC<Props> = ({
  form,
  onChange,
  isCreating,
  updatedAt,
  doc,
  canEdit,
  isUploading,
  pendingFiles = [],
  onUploadAttachment,
  onDeleteAttachment,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useAutoResize(form.title);
  const summaryRef = useAutoResize(form.summary);
  const contentRef = useAutoResize(form.content);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
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
        rows={2}
        aria-label="Summary"
      />

      <hr className="notion-divider" />

      <textarea
        ref={contentRef}
        className="notion-content-input"
        name="content"
        value={form.content}
        onChange={handleChange}
        placeholder="Start writing…"
        rows={8}
        aria-label="Content"
      />

      {canEdit && (
        <div className="notion-attachments">
          <div className="notion-attachments-header">
            <Paperclip size={13} aria-hidden />
            <span>Attachments</span>
          </div>

          {existingAttachments.length > 0 && (
            <ul className="attachment-list">
              {existingAttachments.map((att) => (
                <li key={att._id} className="attachment-item">
                  <Paperclip size={13} className="attachment-icon" />
                  <span className="attachment-name">{att.fileName}</span>
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="attachment-open"
                    title="Open file"
                  >
                    <ExternalLink size={13} />
                  </a>
                  <button
                    type="button"
                    className="attachment-delete"
                    title="Remove attachment"
                    onClick={() => onDeleteAttachment?.(att._id)}
                  >
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {pendingFiles.length > 0 && (
            <ul className="attachment-list">
              {pendingFiles.map((f) => (
                <li key={f.name} className="attachment-item">
                  <Paperclip size={13} className="attachment-icon" />
                  <span className="attachment-name">{f.name}</span>
                  <span className="attachment-pending-badge">on save</span>
                  <button
                    type="button"
                    className="attachment-delete"
                    title="Remove"
                    onClick={() => onDeleteAttachment?.(f.name)}
                  >
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="attachment-add-btn"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus size={14} />
            {isUploading ? "Uploading…" : "Add file"}
          </button>
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
      )}
    </div>
  );
};
