import { FlaskConical } from "lucide-react";
import { DEMO_LIMITS } from "../../../../auth/demoLimits";

const { documents, contentLength, attachmentsPerDocument } = DEMO_LIMITS;
const ATTACHMENTS = `${attachmentsPerDocument} attachment${attachmentsPerDocument === 1 ? "" : "s"}`;

export default function DemoBanner() {
  return (
    <div className="demo-banner" role="status">
      <FlaskConical size={14} aria-hidden />
      <span>
        Demo workspace: your own private copy of the sample documents. Edit, add, delete and chat freely.
        It's one-time: everything is deleted when you sign out, and you can't return to it later.
        Limits: {documents} documents, {contentLength.toLocaleString("en-US")} characters
        and {ATTACHMENTS} per document. Import and admin settings are disabled.
      </span>
    </div>
  );
}
