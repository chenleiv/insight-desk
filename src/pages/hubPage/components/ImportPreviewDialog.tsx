import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DocumentInput } from "../../../api/documentsClient";

type Props = {
  docs: Partial<DocumentInput>[];
  onConfirm: (docs: DocumentInput[]) => void;
  onCancel: () => void;
};

function isComplete(d: Partial<DocumentInput>): d is DocumentInput {
  return !!(d.title?.trim() && d.category?.trim() && d.summary?.trim() && d.content?.trim());
}

export default function ImportPreviewDialog({ docs: initialDocs, onConfirm, onCancel }: Props) {
  const [docs, setDocs] = useState<Partial<DocumentInput>[]>(initialDocs);
  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => firstInputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  function update(index: number, field: keyof DocumentInput, value: string) {
    setDocs((prev) => prev.map((d, i) => i === index ? { ...d, [field]: value } : d));
  }

  const allComplete = docs.every(isComplete);

  return createPortal(
    <div className="confirm-overlay" onClick={onCancel} role="presentation">
      <div
        ref={modalRef}
        className="import-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-preview-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="import-preview-header">
          <h3 id="import-preview-title">Import Preview</h3>
          <span className="import-preview-count">{docs.length} document{docs.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="import-preview-body">
          {docs.map((doc, i) => (
            <div key={i} className="import-doc-card">
              {docs.length > 1 && (
                <div className="import-doc-number">#{i + 1}</div>
              )}

              <div className="import-doc-row">
                <label className="import-doc-label">
                  Title *
                  <input
                    ref={i === 0 ? firstInputRef : undefined}
                    className="import-doc-input"
                    value={doc.title ?? ""}
                    onChange={(e) => update(i, "title", e.target.value)}
                    placeholder="Document title"
                    maxLength={200}
                  />
                </label>
                <label className="import-doc-label">
                  Category *
                  <input
                    className="import-doc-input"
                    value={doc.category ?? ""}
                    onChange={(e) => update(i, "category", e.target.value)}
                    placeholder="e.g. Research"
                    maxLength={100}
                  />
                </label>
              </div>

              <label className="import-doc-label">
                Summary *
                <textarea
                  className="import-doc-textarea"
                  rows={2}
                  value={doc.summary ?? ""}
                  onChange={(e) => update(i, "summary", e.target.value)}
                  placeholder="Brief summary"
                  maxLength={2000}
                />
                <span className="import-doc-char-count">
                  {(doc.summary ?? "").length} / 2000
                </span>
              </label>

              <details className="import-doc-content-preview">
                <summary>Content preview</summary>
                <pre className="import-doc-content-text">
                  {(doc.content ?? "").slice(0, 400)}{(doc.content?.length ?? 0) > 400 ? "…" : ""}
                </pre>
              </details>
            </div>
          ))}
        </div>

        <div className="confirm-actions">
          <button
            type="button"
            className="primary-btn"
            disabled={!allComplete}
            onClick={() => allComplete && onConfirm(docs as DocumentInput[])}
          >
            Import {docs.length > 1 ? `${docs.length} documents` : "document"}
          </button>
          <button type="button" className="secondary-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
