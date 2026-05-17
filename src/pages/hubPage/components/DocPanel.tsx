import { useState, useMemo } from "react";
import { Search, X, Paperclip, BrainCircuit, Star, Plus, ChevronRight } from "lucide-react";
import type { DocumentItem } from "../../../api/documentsClient";
import { getCategoryTagStyle } from "../utils/docs";
import { Skeleton } from "../../../components/skeleton/Skeleton";

type Props = {
  docs: DocumentItem[];
  favorites: Record<string, boolean>;
  selectedIds: string[];
  activeDocId: string | null;
  onOpenDocument: (id: string) => void;
  onNew: () => void;
  onToggleFavorite: (id: string) => void;
  onToggleSelected: (id: string) => void;
  onClearSelection: () => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  loading?: boolean;
};

export default function DocPanel({
  docs,
  favorites,
  selectedIds,
  activeDocId,
  onOpenDocument,
  onNew,
  onToggleFavorite,
  onToggleSelected,
  onClearSelection,
  isCollapsed,
  onToggleCollapsed,
  loading,
}: Props) {
  const [panelSearch, setPanelSearch] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const filteredDocs = useMemo(() => {
    const q = panelSearch.toLowerCase();
    return docs.filter((d) => {
      if (showFavoritesOnly && !favorites[d.id]) return false;
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        (d.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [docs, favorites, panelSearch, showFavoritesOnly]);

  if (isCollapsed) {
    return (
      <div
        className="doc-panel doc-panel--collapsed"
        onClick={onToggleCollapsed}
        role="button"
        aria-label="Expand documents panel"
        data-tooltip="Open documents"
        data-tooltip-pos="right"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggleCollapsed?.(); }}
      >
        <ChevronRight size={13} className="doc-panel-collapsed-arrow" />
        <span className="doc-panel-collapsed-label">Documents</span>
      </div>
    );
  }

  return (
    <div className="doc-panel">
      <div className="doc-panel-header">
        <span className="doc-panel-title">Documents</span>
        <div className="doc-panel-header-actions">
          {selectedIds.length > 0 && (
            <button
              type="button"
              className="doc-panel-clear-btn"
              onClick={onClearSelection}
              data-tooltip="Clear AI context"
              data-tooltip-pos="bottom"
            >
              {selectedIds.length} ×
            </button>
          )}
          <button
            type="button"
            className={`doc-panel-star-btn${showFavoritesOnly ? " active" : ""}`}
            onClick={() => setShowFavoritesOnly((v) => !v)}
            data-tooltip={showFavoritesOnly ? "Show all" : "Favorites only"}
            data-tooltip-pos="bottom"
          >
            <Star size={16} />
          </button>
        </div>
      </div>

      <button type="button" className="doc-panel-new-row" onClick={onNew}>
        <Plus size={13} />
        New document
      </button>

      <div className="doc-panel-search">
        <Search size={13} className="doc-panel-search-icon" />
        <input
          className="doc-panel-search-input"
          placeholder="Filter…"
          value={panelSearch}
          onChange={(e) => setPanelSearch(e.target.value)}
        />
        {panelSearch && (
          <button
            type="button"
            className="doc-panel-search-clear"
            onClick={() => setPanelSearch("")}
            aria-label="Clear filter"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <ul className="doc-panel-list">
        {loading && Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="doc-panel-row">
            <div className="doc-panel-row-body">
              <Skeleton width="75%" height={13} />
              <Skeleton width="40%" height={11} style={{ marginTop: 4 }} />
            </div>
          </li>
        ))}
        {!loading && filteredDocs.map((doc) => {
          const isContext = selectedIds.includes(doc.id);
          const isActive = doc.id === activeDocId;
          const isFav = !!favorites[doc.id];
          return (
            <li
              key={doc.id}
              className={`doc-panel-row${isActive ? " doc-panel-row--active" : ""}${isContext ? " doc-panel-row--context" : ""}`}
              onClick={() => onOpenDocument(doc.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onOpenDocument(doc.id);
              }}
            >
              <div className="doc-panel-row-body">
                <span className="doc-panel-row-title">{doc.title || "Untitled"}</span>
                <div className="doc-panel-row-meta">
                  {doc.category && (
                    <span className="doc-panel-row-chip" style={getCategoryTagStyle(doc.category)}>
                      {doc.category}
                    </span>
                  )}
                  {(doc.attachments?.length ?? 0) > 0 && (
                    <span className="doc-panel-row-attachments">
                      <Paperclip size={10} />
                      {doc.attachments!.length}
                    </span>
                  )}
                </div>
              </div>
              <div className="doc-panel-row-icons">
                <button
                  type="button"
                  className={`doc-panel-row-star-btn${isFav ? " active" : ""}`}
                  onClick={(e) => { e.stopPropagation(); void onToggleFavorite(doc.id); }}
                  aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                  data-tooltip={isFav ? "Remove from favorites" : "Add to favorites"}
                  data-tooltip-pos="left"
                >
                  <Star size={14} fill={isFav ? "currentColor" : "none"} />
                </button>
                <button
                  type="button"
                  className={`doc-panel-row-ctx-btn${isContext ? " active" : ""}`}
                  onClick={(e) => { e.stopPropagation(); onToggleSelected(doc.id); }}
                  aria-label={isContext ? "Remove from AI context" : "Add to AI context"}
                  data-tooltip={isContext ? "Remove from AI context" : "Add to AI context"}
                  data-tooltip-pos="left"
                >
                  <BrainCircuit size={14} />
                </button>
              </div>
            </li>
          );
        })}
        {!loading && filteredDocs.length === 0 && (
          <div className="doc-panel-empty">
            {showFavoritesOnly ? "No favorites yet" : panelSearch ? "No documents match" : "No documents yet"}
          </div>
        )}
      </ul>
    </div>
  );
}
