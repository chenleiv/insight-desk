import { useState } from "react";
import ImportMenuButton from "./ImportMenuButton";
import { FilePlusCorner, Star } from "lucide-react";

type Props = {
  onNew: () => void;
  onExport: () => Promise<void> | void;
  onImport: (mode: "merge" | "replace") => void;
  isAdmin: boolean;
  showOnlyFavorites: boolean;
  onToggleFavorites: () => void;
};

export default function DocumentsHeader({
  onNew,
  onExport,
  onImport,
  isAdmin,
  showOnlyFavorites,
  onToggleFavorites,
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
        >
          {isExporting ? "Exporting..." : "Export"}
        </button>
        {isAdmin && <ImportMenuButton onImport={onImport} />}
      </div>
      <button
        className={`favorite-button text-btn ${showOnlyFavorites ? "active" : ""}`}
        type="button"
        onClick={onToggleFavorites}
        title={showOnlyFavorites ? "Show all documents" : "Show only favorites"}
      >
        <Star
          size={22}
          width={22}
          fill={showOnlyFavorites ? "currentColor" : "none"}
        />
      </button>
      <button className="add-btn text-btn" type="button" onClick={onNew}>
        <FilePlusCorner size={22} width={22} />
      </button>
    </div>
  );
}
