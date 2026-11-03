import { useId, useState } from "react";
import { ChevronDown, FlaskConical } from "lucide-react";
import { DEMO_LIMITS } from "../../../../auth/demoLimits";

const { documents, contentLength, attachmentsPerDocument } = DEMO_LIMITS;
const ATTACHMENTS = `${attachmentsPerDocument} attachment${attachmentsPerDocument === 1 ? "" : "s"}`;

// One string, so no spaces depend on how the text is split into DOM nodes.
const DETAILS = "Demo workspace: your own private copy of the sample documents, deleted when you sign out. "
  + "Edit, add and chat freely. "
  + `Limits: ${documents} documents, ${contentLength.toLocaleString("en-US")} characters `
  + `and ${ATTACHMENTS} per document. Import and admin settings are disabled.`;

type Props = {
  // One line with the details behind a tap, for narrow screens.
  compact?: boolean;
};

export default function DemoBanner({ compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();

  if (compact) {
    return (
      <div className="demo-banner demo-banner--compact" role="status">
        <button
          type="button"
          className="demo-banner-toggle"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((v) => !v)}
        >
          <FlaskConical size={14} aria-hidden />
          <span className="demo-banner-summary">Demo workspace</span>
          <span className="demo-banner-more">Details</span>
          <ChevronDown size={14} className={open ? "open" : undefined} aria-hidden />
        </button>
        <p id={detailsId} className="demo-banner-details" hidden={!open}>{DETAILS}</p>
      </div>
    );
  }

  return (
    <div className="demo-banner" role="status">
      <FlaskConical size={14} aria-hidden />
      <span>{DETAILS}</span>
    </div>
  );
}
