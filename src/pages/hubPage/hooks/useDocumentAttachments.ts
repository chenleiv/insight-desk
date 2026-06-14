import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Attachment, DocumentItem } from "../../../api/documentsClient";
import { uploadAttachment, deleteAttachment } from "../../../api/documentsClient";
import { ApiError } from "../../../api/base";
import { DOCUMENTS_QUERY_KEY } from "../../../context/DocumentsContext";
import { useStatus } from "../../../components/statusBar/useStatus";
import useConfirm from "../../../hooks/useConfirm";

type Options = {
  doc: DocumentItem | null;
  canEdit: boolean;
  onSaved: (doc: DocumentItem) => void;
};

export function useDocumentAttachments({ doc, canEdit, onSaved }: Options) {
  const status = useStatus();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const [isUploading, setIsUploading] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [localAttachments, setLocalAttachments] = useState<Attachment[] | null>(null);

  const docId = doc?.id;
  useEffect(() => { setLocalAttachments(null); }, [docId]);

  const effectiveDoc = useMemo<DocumentItem | null>(() => {
    if (!doc) return null;
    if (localAttachments === null) return doc;
    return { ...doc, attachments: localAttachments };
  }, [doc, localAttachments]);

  const handleUploadAttachment = useCallback(async (file: File) => {
    if (!doc) return;
    setIsUploading(true);
    try {
      const attachment = await uploadAttachment(doc.id, file);
      const current = localAttachments ?? doc.attachments ?? [];
      const next = [...current, attachment];
      setLocalAttachments(next);
      onSaved({ ...doc, attachments: next });
      status.show({ kind: "success", message: "File attached." });
    } catch (e) {
      status.show({ kind: "error", title: "Upload failed", message: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      setIsUploading(false);
    }
  }, [doc, localAttachments, onSaved, status]);

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
    deletingAttachmentId,
    pendingFiles,
    setPendingFiles,
    effectiveDoc,
    handleUploadAttachment,
    handleDeleteAttachment,
  };
}
