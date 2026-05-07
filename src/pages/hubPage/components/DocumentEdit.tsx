import React, { useMemo } from "react";
import { Clock } from "lucide-react";
import type { DocumentInput } from "../../../api/documentsClient";

type Props = {
  form: DocumentInput;
  onChange: (form: DocumentInput) => void;
  isCreating: boolean;
  updatedAt?: string | undefined;
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
}) => {
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

  return (
    <div className="doc-pane-body doc-pane-body--edit">
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
