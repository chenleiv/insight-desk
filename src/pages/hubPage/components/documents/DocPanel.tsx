import React, { useState, useMemo } from "react";
import { Search, X, Paperclip, Star, Plus, ChevronRight } from "lucide-react";
import type { DocumentItem } from "../../../../api/documentsClient";
import { getCategoryChipStyle } from "../../utils/docs";
import { Skeleton } from "../../../../components/skeleton/Skeleton";

type Props = {
  docs: DocumentItem[];
  favorites: Record<string, boolean>;
  activeDocId: string | null;
  onOpenDocument: (id: string) => void;
  onNew: () => void;
  canCreate: boolean;
  onToggleFavorite: (id: string) => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  loading?: boolean;
};

export default function DocPanel({
  docs,
  favorites,
  activeDocId,
  onOpenDocument,
  onNew,
  canCreate,
  onToggleFavorite,
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

  return (
    <div
      className={`doc-panel${isCollapsed ? " doc-panel--collapsed" : ""}`}
      {...(isCollapsed ? {
        onClick: onToggleCollapsed,
        role: "button" as const,
        tabIndex: 0,
        "data-tooltip": "Open documents",
        "data-tooltip-pos": "right",
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") onToggleCollapsed?.(); },
        "aria-label": "Expand documents panel",
      } : {})}
    >
      <div className="doc-panel-collapsed-tab" aria-hidden={!isCollapsed}>
        <ChevronRight size={13} />
        <span className="doc-panel-collapsed-label">Documents</span>
      </div>

      <div className="doc-panel-expanded">
      <div className="doc-panel-header">
        <span className="doc-panel-title">Documents</span>
        <div className="doc-panel-header-actions">
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

      <button
        type="button"
        className="doc-panel-new-row"
        onClick={onNew}
        disabled={!canCreate}
        title={canCreate ? undefined : "Admin only"}
      >
        <Plus size={13} />
        New document
        {!canCreate && <span className="doc-panel-new-row-tag">Admin only</span>}
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
          const isActive = doc.id === activeDocId;
          const isFav = !!favorites[doc.id];
          return (
            <li
              key={doc.id}
              className={`doc-panel-row${isActive ? " doc-panel-row--active" : ""}`}
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
                    <span className="doc-panel-row-chip" style={getCategoryChipStyle(doc.category)}>
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
    </div>
  );
}
