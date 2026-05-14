import React, { useMemo, useRef } from "react";
import { Clock, Paperclip, ExternalLink, X, Plus } from "lucide-react";
import type { DocumentInput, DocumentItem } from "../../../api/documentsClient";

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

function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return "Just now";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Just now";
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    onChange({ ...form, [e.target.name]: e.target.value });
  };

  const timeLabel = useMemo(
    () => (isCreating ? "Just now" : formatRelativeTime(updatedAt)),
    [isCreating, updatedAt],
  );

  const words = countWords(form.content);

  const showAttachments = canEdit && (isCreating || !!doc);
  const existingAttachments = doc?.attachments ?? [];

  return (
    <div className="doc-pane-body doc-pane-body--edit">
      {showAttachments && (
        <div className="doc-pane-section">
          <div className="doc-pane-label">Attachments</div>

          {/* Existing saved attachments (edit mode) */}
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

          {/* Pending files queued for upload on save (new doc) */}
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

          {existingAttachments.length === 0 && pendingFiles.length === 0 && (
            <p className="attachment-empty-text">No attachments yet</p>
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

      <div
        className="doc-pane-edit-meta"
      >
        <label className="doc-pane-category-pill-label">
          <input
            name="category"
            className="doc-pane-category-pill"
            value={form.category}
            onChange={handleChange}
            placeholder="Category"
            autoComplete="off"
            aria-label="Category"
          />
        </label>
        <span className="doc-pane-edited-at">
          <Clock size={14} strokeWidth={2} aria-hidden />
          <span>{timeLabel}</span>
        </span>
      </div>

      {isCreating && (
        <label className="doc-pane-label doc-pane-label--title doc-pane-section">
          Title*
          <input
            name="title"
            className="doc-pane-title-input"
            value={form.title}
            onChange={handleChange}
            placeholder="Untitled document"
            autoFocus
          />
        </label>
      )}

      <div className="doc-pane-section">
        <label className="doc-pane-label" htmlFor="doc-edit-summary">
          Summary*
        </label>
        <textarea
          id="doc-edit-summary"
          name="summary"
          rows={4}
          value={form.summary}
          onChange={handleChange}
          placeholder="Brief summary"
        />
      </div>

      <div className="doc-pane-section doc-pane-section--content">
        <label className="doc-pane-label" htmlFor="doc-edit-content">
          Content*
        </label>
        <textarea
          id="doc-edit-content"
          name="content"
          className="doc-pane-content-editor"
          rows={14}
          value={form.content}
          onChange={handleChange}
          placeholder="Write your document…"
        />
      </div>

      <div className="doc-pane-edit-footer">
        <span className="doc-pane-wordcount">
          {words} {words === 1 ? "word" : "words"}
        </span>
      </div>
    </div>
  );
};
