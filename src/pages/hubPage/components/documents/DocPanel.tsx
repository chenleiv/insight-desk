import React, { useState, useMemo } from "react";
import { Search, X, Paperclip, Star, Plus, ChevronRight } from "lucide-react";
import type { DocumentItem } from "../../../../api/documentsClient";
import { docHasCategory, getCategoryChipStyle, getCategoryOptions } from "../../utils/docs";
import { Skeleton, SkeletonLine } from "../../../../components/skeleton/Skeleton";

type Props = {
  docs: DocumentItem[];
  favorites: Record<string, boolean>;
  activeDocId: string | null;
  onOpenDocument: (id: string) => void;
  onNew: () => void;
  canCreate: boolean;
  createDisabledLabel?: string;
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
  createDisabledLabel = "Admin only",
  onToggleFavorite,
  isCollapsed,
  onToggleCollapsed,
  loading,
}: Props) {
  const [panelSearch, setPanelSearch] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");

  const categoryOptions = useMemo(() => getCategoryOptions(docs), [docs]);
  // A category whose last document was deleted or renamed stops filtering.
  const activeCategory = categoryOptions.some((c) => c.key === categoryFilter) ? categoryFilter : "";

  const filteredDocs = useMemo(() => {
    const q = panelSearch.toLowerCase();
    return docs.filter((d) => {
      if (showFavoritesOnly && !favorites[d.id]) return false;
      if (activeCategory && !docHasCategory(d, activeCategory)) return false;
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        (d.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [docs, favorites, panelSearch, showFavoritesOnly, activeCategory]);

  // A category listed in the select always has a document, so another filter emptied the list.
  const emptyMessage = activeCategory
    ? (panelSearch ? "No documents in this category match your filter" : "No favorites in this category")
    : showFavoritesOnly ? "No favorites yet" : panelSearch ? "No documents match" : "No documents yet";

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
            aria-label={showFavoritesOnly ? "Show all" : "Favorites only"}
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
        title={canCreate ? undefined : createDisabledLabel}
      >
        <Plus size={13} />
        New document
        {!canCreate && <span className="doc-panel-new-row-tag">{createDisabledLabel}</span>}
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

      <div className="doc-panel-search">
        <select
          className="doc-panel-category-select"
          aria-label="Filter by category"
          value={activeCategory}
          onChange={(e) => setCategoryFilter(e.target.value)}
          disabled={categoryOptions.length === 0}
        >
          <option value="">All categories</option>
          {categoryOptions.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </div>

      {loading && <span className="visually-hidden" role="status">Loading documents…</span>}
      <ul className="doc-panel-list" aria-busy={loading || undefined}>
        {loading && Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="doc-panel-row skeleton-static">
            <div className="doc-panel-row-body">
              <span className="doc-panel-row-title"><SkeletonLine width="75%" /></span>
              <div className="doc-panel-row-meta">
                <Skeleton width={48} height={17} />
              </div>
            </div>
            <div className="doc-panel-row-icons">
              <Skeleton width={24} height={24} />
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
          <div className="doc-panel-empty">{emptyMessage}</div>
        )}
      </ul>
      </div>
    </div>
  );
}
