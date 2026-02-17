import { useState } from "react";
import ImportMenuButton from "./ImportMenuButton";
import { FilePlusCorner } from "lucide-react";

type Props = {
  onNew: () => void;
  onExport: () => Promise<void> | void;
  onImport: (mode: "merge" | "replace") => void;
  isAdmin: boolean;
};

export default function DocumentsHeader({
  onNew,
  onExport,
  onImport,
  isAdmin,
}: Props) {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await onExport();
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="top-actions" onClick={(e) => e.stopPropagation()}>
      <div className="actions-buttons">
        <button
          className="text-btn export-btn"
          type="button"
          onClick={handleExport}
          disabled={isExporting}
          title="Export"
          aria-label="Export"
        >
          Export
        </button>
        {isAdmin && <ImportMenuButton onImport={onImport} />}
      </div>
      <button
        className="add-btn text-btn"
        type="button"
        title="New document"
        aria-label="New document"
        onClick={onNew}
      >
        <FilePlusCorner size={22} width={22} />
      </button>
    </div>
  );
}
