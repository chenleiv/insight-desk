import type { CSSProperties } from "react";
import { useRef, useState } from "react";
import { LayoutGrid, List, Plus, PanelRight, FileText, Star, Search, Filter, GripVertical, Download, Upload, Paperclip } from "lucide-react";
import type { DocumentItem } from "../../../api/documentsClient";
import { formatRelativeTime } from "../../../utils/relativeTime";
import { Skeleton } from "../../../components/skeleton/Skeleton";
import Menu from "../../../components/menu/Menu";
import {

  getCategoryIconStyle,
  getCategoryTagStyle,
  getDocTags,
  resolveCategoryVisual,
} from "../utils/docs";

type Props = {
  docs: DocumentItem[];
  favorites?: Record<string | number, boolean>;
  onOpen: (id: number) => void;
  onToggleFavorite: (id: number) => void;
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onNew?: () => void;
  onExport?: () => void;
  onImport?: (mode: "append" | "replace", fileType: "json" | "text" | "excel" | "word") => void;
  isAdmin?: boolean;
  loading?: boolean;
  splitView?: boolean;
  onToggleSplitView?: () => void;
  categories?: { name: string; count: number }[];
  categoryFilter?: string | null;
  onCategoryFilterChange?: (category: string | null) => void;
};

function DocumentCardSkeleton() {
  return (
    <article className="document-card document-card-skeleton">
      <Skeleton width="80%" height={18} />
      <Skeleton width="100%" height={14} />
      <Skeleton width="60%" height={14} />
      <div className="card-footer">
        <Skeleton width={60} height={12} />
      </div>
    </article>
  );
}


export default function DocumentsGridView({
  docs,
  favorites,
  onOpen,
  onToggleFavorite,
  viewMode,
  onViewModeChange,
  searchQuery,
  onSearchChange,
  onNew,
  onExport,
  onImport,
  isAdmin,
  loading,
  splitView = false,
  onToggleSplitView,
  categories = [],
  categoryFilter = null,
  onCategoryFilterChange,
}: Props) {
  const [showImportMenu, setShowImportMenu] = useState(false);
  const importBtnRef = useRef<HTMLButtonElement>(null);

  const importMenuOptions = [
    {
      label: "JSON",
      onClick: () => { onImport?.("append", "json"); setShowImportMenu(false); },
    },
    {
      label: "TXT / MD / RTF",
      onClick: () => { onImport?.("append", "text"); setShowImportMenu(false); },
    },
    {
      label: "Excel (.xlsx)",
      onClick: () => { onImport?.("append", "excel"); setShowImportMenu(false); },
    },
    {
      label: "Word (.docx)",
      onClick: () => { onImport?.("append", "word"); setShowImportMenu(false); },
    },
  ];

  return (
    <div className="documents-view">
      <div className="documents-header">
        <div className="documents-header-title">
          <h1 className="documents-title">Documents</h1>
          <span className="documents-count">{docs.length} document{docs.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="documents-header-actions">
          {isAdmin && onExport && (
            <button className="icon-btn" onClick={onExport} title="Export documents">
              <Download size={16} />
            </button>
          )}
          {isAdmin && onImport && (
            <>
              <button
                className="icon-btn"
                ref={importBtnRef}
                onClick={() => setShowImportMenu(true)}
                title="Import documents"
              >
                <Upload size={16} />
              </button>
              <Menu
                open={showImportMenu}
                onClose={() => setShowImportMenu(false)}
                items={importMenuOptions}
                anchorRef={importBtnRef}
              />
            </>
          )}
          {onNew && (
            <button className="documents-new-btn" onClick={onNew}>
              <Plus size={18} />
              New Document
            </button>
          )}
        </div>
      </div>

      <div className="documents-toolbar">
        <div className="documents-search-container">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="documents-search-input"
            placeholder="Search documents by title or content..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        
        <div className="documents-toolbar-actions">
          <div className="documents-view-toggle">
            {onToggleSplitView && (
              <button
                className={`view-btn ${splitView ? "active" : ""}`}
                onClick={onToggleSplitView}
                aria-label="Split view"
                title="Split view"
              >
                <PanelRight size={16} />
              </button>
            )}
            <button
              className={`view-btn ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => onViewModeChange("grid")}
              aria-label="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              className={`view-btn ${viewMode === "list" ? "active" : ""}`}
              onClick={() => onViewModeChange("list")}
              aria-label="List view"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {onCategoryFilterChange && (
        <div className="documents-filters">
          <div className="filter-icon-wrapper">
            <Filter size={16} />
          </div>
          <button
            type="button"
            className={`filter-chip filter-chip-all ${!categoryFilter || categoryFilter === "all" ? "active" : ""}`}
            onClick={() => onCategoryFilterChange(null)}
            style={
              !categoryFilter || categoryFilter === "all"
                ? { background: "var(--primary)", color: "var(--primary-text)", border: "1px solid var(--primary)" }
                : { background: "var(--panel)", color: "var(--muted)", border: "1px solid var(--border)" }
            }
          >
            All
          </button>
          {categories.map(({ name, count }) => {
            const vis = resolveCategoryVisual(name);
            const isActive = categoryFilter === name;
            const tagStyle = getCategoryTagStyle(name);
            return (
              <button
                key={name}
                type="button"
                className={`filter-chip filter-chip-category ${isActive ? "active" : ""}`}
                onClick={() => onCategoryFilterChange(isActive ? null : name)}
                style={{
                  background: isActive ? tagStyle.backgroundColor : "var(--panel)",
                  color: tagStyle.color,
                  border: isActive
                    ? `1px solid ${tagStyle.color}`
                    : `1px solid ${vis.chipBorder}`,
                  fontWeight: isActive ? 600 : undefined,
                }}
              >
                {name} <span className="filter-count">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      <div className={`documents-grid ${viewMode === "list" ? "list-mode" : ""}`}>
        {loading && docs.length === 0 ? (
          <>
            <DocumentCardSkeleton />
            <DocumentCardSkeleton />
            <DocumentCardSkeleton />
            <DocumentCardSkeleton />
          </>
        ) : docs.length === 0 ? (
          <div className="documents-empty-state">
            {searchQuery.trim() ? (
              <>
                <p className="documents-empty-title">No documents match your search</p>
                <p className="documents-empty-sub">Try a different search term or clear the search</p>
                <button
                  className="documents-empty-btn"
                  onClick={() => onSearchChange("")}
                >
                  Clear search
                </button>
              </>
            ) : (
              <>
                <p className="documents-empty-title">No documents yet</p>
                <p className="documents-empty-sub">Create your first document to get started</p>
                {onNew && (
                  <button
                    className="documents-empty-btn documents-empty-btn-primary"
                    onClick={onNew}
                  >
                    <Plus size={18} />
                    Create document
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          docs.filter((d): d is DocumentItem => !!d).map((doc) => {
            const tags = getDocTags(doc);
            const primaryTag = tags[0];
            const catVis = primaryTag ? resolveCategoryVisual(primaryTag) : null;
            const iconStyle = primaryTag
              ? getCategoryIconStyle(primaryTag)
              : { backgroundColor: "var(--soft)", color: "var(--muted)" };
            return (
              <article
                key={doc.id}
                className={`document-card ${viewMode === "list" ? "list-mode" : ""} ${primaryTag ? "document-card--categorized" : ""}`}
                style={
                  catVis
                    ? ({
                        "--doc-cat-accent": catVis.tagFg,
                        "--doc-cat-border": catVis.chipBorder,
                      } as CSSProperties)
                    : undefined
                }
                onClick={() => onOpen(doc.id)}
              >
                <div className="card-top-actions">
                  <div className="card-drag-handle" aria-hidden>
                    <GripVertical size={14} />
                  </div>
                  {doc.attachments && doc.attachments.length > 0 && (
                    <span className="card-attachment-badge" title={`${doc.attachments.length} attachment${doc.attachments.length !== 1 ? "s" : ""}`}>
                      <Paperclip size={11} />
                      {doc.attachments.length}
                    </span>
                  )}
                  <Star
                    size={16}
                    fill={favorites?.[doc.id] ? "var(--gold)" : "none"}
                    className={`card-favorite ${favorites?.[doc.id] ? "is-fav" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(doc.id);
                    }}
                  />
                </div>
                
                <div className="card-icon-wrap" style={iconStyle}>
                  <FileText size={18} />
                </div>
                
                <h3 className="card-title">{doc.title || "Untitled Document"}</h3>
                <p className="card-snippet">
                  {(() => {
                    const text = doc.summary || doc.content || "No content";
                    const preview = text.slice(0, 120);
                    return preview + (text.length > 120 ? "..." : "");
                  })()}
                </p>
                
                <div className="card-footer">
                  {tags.length > 0 && (
                    <div className="card-tags">
                      {tags.map((tag) => {
                        const style = getCategoryTagStyle(tag);
                        return (
                          <span key={tag} className="card-tag" style={style}>
                            {tag}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <span className="card-time">{formatRelativeTime(doc.updatedAt ?? doc.createdAt)}</span>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
