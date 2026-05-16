import React, { useRef } from "react";
import { Clock, Paperclip, ExternalLink, X, Plus, } from "lucide-react";
import type { DocumentItem } from "../../../api/documentsClient";
import { formatRelativeTime } from "../../../utils/relativeTime";

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
  const timeAgo = formatRelativeTime(doc.updatedAt ?? doc.createdAt);
  const hasAttachments = doc.attachments && doc.attachments.length > 0;

  return (
    <div className="notion-doc-body doc-pane-anim">
      <h1 className="notion-title">{doc.title || "Untitled"}</h1>

      <div className="notion-properties">
        {doc.category && (
          <span className="notion-category-chip">{doc.category}</span>
        )}
        <span className="notion-date">
          <Clock size={13} strokeWidth={2} aria-hidden />
          {timeAgo}
        </span>
      </div>

      {(canEdit || hasAttachments) && (
        <div className="notion-att-chips">
          {doc.attachments?.map((att) => (
            <span key={att._id} className="notion-att-chip">
              <Paperclip size={11} aria-hidden />
              <span className="notion-att-chip-name">{att.fileName}</span>
              <a
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="notion-att-chip-action"
                title="Open"
              >
                <ExternalLink size={11} />
              </a>
              {canEdit && (
                <button
                  type="button"
                  className="notion-att-chip-action"
                  title="Remove attachment"
                  onClick={() => onDeleteAttachment?.(att._id)}
                >
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
          {canEdit && (
            <>
              <button
                type="button"
                className="notion-att-chip notion-att-chip--add"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus size={11} />
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

      {doc.summary && (
        <p className="notion-summary">{doc.summary}</p>
      )}

      <hr className="notion-divider" />

      <div className="notion-content">{doc.content}</div>
    </div>
  );
});
