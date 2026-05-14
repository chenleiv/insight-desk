import React, { useRef } from "react";
import { Paperclip, ExternalLink, X, Plus } from "lucide-react";
import type { DocumentItem } from "../../../api/documentsClient";

type Props = {
  doc: DocumentItem;
  canEdit?: boolean;
  isUploading?: boolean;
  onUploadAttachment?: (file: File) => void;
  onDeleteAttachment?: (attachmentId: string) => void;
};

export const DocumentView = React.memo(function DocumentView({
  doc,
  canEdit,
  isUploading,
  onUploadAttachment,
  onDeleteAttachment,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="doc-pane-body doc-pane-anim">
      {(canEdit || (doc.attachments && doc.attachments.length > 0)) && (
        <div className="doc-pane-section">
          <div className="doc-pane-label">Attachments</div>
          {doc.attachments && doc.attachments.length > 0 ? (
            <ul className="attachment-list">
              {doc.attachments.map((att) => (
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
                  {canEdit && (
                    <button
                      type="button"
                      className="attachment-delete"
                      title="Remove attachment"
                      onClick={() => onDeleteAttachment?.(att._id)}
                    >
                      <X size={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            canEdit && <p className="attachment-empty-text">No attachments yet</p>
          )}
          {canEdit && (
            <>
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
                disabled={isUploading}
              />
            </>
          )}
        </div>
      )}

      <div className="doc-pane-section">
        <div className="doc-pane-label">Summary</div>
        <div className="doc-pane-text">{doc.summary}</div>
      </div>

      <div className="doc-pane-section">
        <div className="doc-pane-label">Content</div>
        <div className="doc-pane-text prewrap">{doc.content}</div>
      </div>
    </div>
  );
});
