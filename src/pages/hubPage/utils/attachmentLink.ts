import { getApiBase } from "../../../api/config";
import type { Attachment } from "../../../api/documentsClient";

// Attachments from before GridFS exist only in this Supabase project's storage.
const LEGACY_ATTACHMENT_HOST = "nohpeeboyrhslwucxdog.supabase.co";

/**
 * Where an attachment's "Open" link points, or null for no link.
 * Files we store are linked by id through the API, so the absolute URL saved at
 * upload time (which can point at another environment) is never used for them.
 * URL-only legacy files are linked only on the known storage host.
 */
export function attachmentHref(docId: string, att: Attachment): string | null {
  if (att.gridfsId) {
    return `${getApiBase()}/api/documents/${encodeURIComponent(docId)}/attachments/${encodeURIComponent(att._id)}/file`;
  }
  try {
    const url = new URL(att.url);
    return url.protocol === "https:" && url.host === LEGACY_ATTACHMENT_HOST ? url.href : null;
  } catch {
    return null;
  }
}
