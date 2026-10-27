import { FlaskConical } from "lucide-react";

export default function DemoBanner() {
  return (
    <div className="demo-banner" role="status">
      <FlaskConical size={14} aria-hidden />
      <span>
        Demo workspace: a private copy of the sample documents. Edit, add, delete and chat freely;
        changes reset after 24 hours. Admin settings are view only.
      </span>
    </div>
  );
}
