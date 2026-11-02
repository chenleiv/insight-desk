import { FlaskConical } from "lucide-react";
import { DEMO_LIMITS } from "../../../../auth/demoLimits";

const { documents, contentLength, attachmentsPerDocument } = DEMO_LIMITS;
const ATTACHMENTS = `${attachmentsPerDocument} attachment${attachmentsPerDocument === 1 ? "" : "s"}`;

export default function DemoBanner() {
  return (
    <div className="demo-banner" role="status">
      <FlaskConical size={14} aria-hidden />
      <span>
        Demo workspace: your own private copy of the sample documents, deleted when you sign out.
        Edit, add and chat freely.
        Limits: {documents} documents, {contentLength.toLocaleString("en-US")} characters
        and {ATTACHMENTS} per document. Import and admin settings are disabled.
      </span>
    </div>
  );
}
