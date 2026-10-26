import { getApiBase } from "../../../api/config";
import type { Attachment } from "../../../api/documentsClient";

/**
 * Where an attachment's "Open" link points, or null for no link.
 * Only files we store are linked, by id through the API, so the absolute URL saved
 * at upload time (which can point at another environment) is never used.
 */
export function attachmentHref(docId: string, att: Attachment): string | null {
  if (!att.gridfsId) return null;
  return `${getApiBase()}/api/documents/${encodeURIComponent(docId)}/attachments/${encodeURIComponent(att._id)}/file`;
}
