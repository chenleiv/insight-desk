import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Attachment, DocumentItem } from "../../../api/documentsClient";
import { uploadAttachment, deleteAttachment } from "../../../api/documentsClient";
import { ApiError } from "../../../api/base";
import { DOCUMENTS_QUERY_KEY } from "../../../context/DocumentsContext";
import { useStatus } from "../../../components/statusBar/useStatus";
import useConfirm from "../../../hooks/useConfirm";
import { uploadError } from "../../../../shared/uploadRules";

// The latest upload, kept after it ends so its outcome can be announced.
export type UploadStatus = { fileName: string; state: "uploading" | "done" | "failed" };

type Options = {
  doc: DocumentItem | null;
  canEdit: boolean;
  onSaved: (doc: DocumentItem) => void;
  // A smaller limit than the default, for demo workspaces.
  maxUploadBytes?: number | undefined;
};

export function useDocumentAttachments({ doc, canEdit, onSaved, maxUploadBytes }: Options) {
  const status = useStatus();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [localAttachments, setLocalAttachments] = useState<Attachment[] | null>(null);

  // Drop local attachment edits when another document opens (reset during render, not in an effect).
  const docId = doc?.id;
  const [attachmentsDocId, setAttachmentsDocId] = useState(docId);
  if (attachmentsDocId !== docId) {
    setAttachmentsDocId(docId);
    setLocalAttachments(null);
    setUploadStatus(null);
  }

  const effectiveDoc = useMemo<DocumentItem | null>(() => {
    if (!doc) return null;
    if (localAttachments === null) return doc;
    return { ...doc, attachments: localAttachments };
  }, [doc, localAttachments]);

  // A file the server would reject is not sent or queued; the user gets the server's message.
  const rejectUpload = useCallback((file: File) => {
    const error = uploadError(file, maxUploadBytes);
    if (error) status.show({ kind: "error", title: "Upload failed", message: error });
    return error !== null;
  }, [status, maxUploadBytes]);

  // Files picked while creating a document are uploaded once it exists.
  const addPendingFile = useCallback((file: File) => {
    if (!rejectUpload(file)) setPendingFiles((prev) => [...prev, file]);
  }, [rejectUpload]);

  const handleUploadAttachment = useCallback(async (file: File) => {
    if (!doc || rejectUpload(file)) return;
    setIsUploading(true);
    setUploadStatus({ fileName: file.name, state: "uploading" });
    try {
      const attachment = await uploadAttachment(doc.id, file);
      const current = localAttachments ?? doc.attachments ?? [];
      const next = [...current, attachment];
      setLocalAttachments(next);
      onSaved({ ...doc, attachments: next });
      setUploadStatus({ fileName: file.name, state: "done" });
      status.show({ kind: "success", message: "File attached." });
    } catch (e) {
      setUploadStatus({ fileName: file.name, state: "failed" });
      status.show({ kind: "error", title: "Upload failed", message: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      setIsUploading(false);
    }
  }, [doc, localAttachments, onSaved, status, rejectUpload]);

  const handleDeleteAttachment = useCallback(async (attachmentId: string) => {
    if (!doc || !canEdit) return;
    const ok = await confirm({
      title: "Remove attachment",
      message: "Remove this file from the document?",
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
      variant: "danger",
    });
    if (!ok) return;
    // Otherwise the region would repeat the last upload once the removal ends.
    setUploadStatus(null);
    setDeletingAttachmentId(attachmentId);
    try {
      await deleteAttachment(doc.id, attachmentId);
      const current = localAttachments ?? doc.attachments ?? [];
      const next = current.filter((a) => a._id !== attachmentId);
      setLocalAttachments(next);
      onSaved({ ...doc, attachments: next });
      status.show({ kind: "success", message: "Attachment removed." });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
      }
      status.show({ kind: "error", title: "Delete failed", message: e instanceof Error ? e.message : "Delete failed." });
    } finally {
      setDeletingAttachmentId(null);
    }
  }, [doc, canEdit, localAttachments, onSaved, status, confirm, queryClient]);

  return {
    isUploading,
    uploadStatus,
    deletingAttachmentId,
    pendingFiles,
    setPendingFiles,
    addPendingFile,
    effectiveDoc,
    handleUploadAttachment,
    handleDeleteAttachment,
  };
}
