import { useId, useState } from "react";
import { ChevronDown, FlaskConical } from "lucide-react";
import { DEMO_LIMITS } from "../../../../auth/demoLimits";

const { documents, contentLength, attachmentsPerDocument, uploadBytes, storageBytes } = DEMO_LIMITS;
const MEGABYTE = 1024 * 1024;
const ATTACHMENTS = `${attachmentsPerDocument} attachment${attachmentsPerDocument === 1 ? "" : "s"}`;

const UPLOAD_DETAILS = `Uploads: up to ${uploadBytes / MEGABYTE} MB per file and ${storageBytes / MEGABYTE} MB per workspace. `
  + "When the demo is busy, the least recently active workspace is removed.";

// Each text is one string, so no spaces depend on how it is split into DOM nodes.
const SUMMARY = "Demo workspace · Your changes reset when you sign out · Details";
const SHORT_SUMMARY = "Demo workspace · Details";
const DETAILS = "Demo workspace: your own private copy of the sample documents, reset when you sign out. "
  + "Edit, add and chat freely. "
  + `Limits: ${documents} documents, ${contentLength.toLocaleString("en-US")} characters `
  + `and ${ATTACHMENTS} per document. Import and admin settings are disabled.`;

type Props = {
  // The shorter one-line text, for narrow screens.
  compact?: boolean;
};

export default function DemoBanner({ compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();

  return (
    <div className="demo-banner" role="status">
      <button
        type="button"
        className="demo-banner-toggle"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen((v) => !v)}
      >
        <FlaskConical size={14} aria-hidden />
        <span className="demo-banner-summary">{compact ? SHORT_SUMMARY : SUMMARY}</span>
        <ChevronDown size={14} className={open ? "open" : undefined} aria-hidden />
      </button>
      <p id={detailsId} className="demo-banner-details" hidden={!open}>{DETAILS}</p>
      <p className="demo-banner-details demo-banner-upload-details" hidden={!open}>{UPLOAD_DETAILS}</p>
    </div>
  );
}
