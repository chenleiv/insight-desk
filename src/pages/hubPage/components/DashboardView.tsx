import { useMemo, useRef, useState, type CSSProperties } from "react";
import { FileText, Star, Sparkles, HardDrive, Download, Upload } from "lucide-react";
import { useDocuments } from "../../../context/DocumentsContext";
import { useAuth } from "../../../auth/useAuth";
import { formatRelativeTime } from "../../../utils/relativeTime";
import type { DocumentItem } from "../../../api/documentsClient";
import { getDocTags, getCategoryIconStyle, getCategoryTagStyle, resolveCategoryVisual } from "../utils/docs";
import Menu from "../../../components/menu/Menu";
import { loadJson, scopedKey } from "../../../utils/storage";
import { AI_QUERY_COUNT_BASE_KEY } from "./AIAssistantView";

type Props = {
  onViewAllDocuments?: () => void;
  onNewDocument?: () => void | Promise<void>;
  onOpenDocument?: (id: number) => void;
  onExport?: () => void;
  onImport?: (mode: "append" | "replace", fileType: "json" | "text" | "excel" | "word") => void;
  isAdmin?: boolean;
};

function docTime(doc: DocumentItem): number {
  const t = doc.updatedAt ?? doc.createdAt;
  if (!t) return 0;
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? 0 : ms;
}

export default function DashboardView({
  onViewAllDocuments,
  onNewDocument,
  onOpenDocument,
  onExport,
  onImport,
  isAdmin,
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
  const { docs } = useDocuments();
  const { user, favoritesMap, toggleFavorite } = useAuth();

  const displayName = useMemo(() => {
    if (user?.displayName) return user.displayName.split(" ")[0];
    const local = (user?.email ?? "").split("@")[0] || "there";
    return local.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).split(" ")[0];
  }, [user?.displayName, user?.email]);

  const recent = useMemo(() => {
    return [...docs].sort((a, b) => docTime(b) - docTime(a)).slice(0, 5);
  }, [docs]);

  const totalDocs = docs.length;
  const favoriteCount = useMemo(
    () => docs.filter((d) => favoritesMap[d.id]).length,
    [docs, favoritesMap]
  );

  const aiQueryCount = useMemo(
    () => loadJson<number>(scopedKey(AI_QUERY_COUNT_BASE_KEY, user?.email), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.email]
  );

  const storageLabel = useMemo(() => {
    const bytes = docs.reduce((sum, d) => {
      return sum +
        (d.title?.length ?? 0) +
        (d.category?.length ?? 0) +
        (d.summary?.length ?? 0) +
        (d.content?.length ?? 0);
    }, 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }, [docs]);

  return (
    <div className="dashboard-view">
      <div className="dashboard-header">
        <div className="dashboard-welcome">
          <h1>Welcome back, {displayName}</h1>
        </div>
      </div>

      <div className="dashboard-stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-icon documents">
              <FileText size={18} />
            </span>
          </div>
          <div className="stat-value">{totalDocs}</div>
          <div className="stat-label">Total Documents</div>
        </div>
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-icon favorites">
              <Star size={18} />
            </span>
          </div>
          <div className="stat-value">{favoriteCount}</div>
          <div className="stat-label">Favorites</div>
        </div>
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-icon queries">
              <Sparkles size={18} />
            </span>
          </div>
          <div className="stat-value">{aiQueryCount}</div>
          <div className="stat-label">AI Queries</div>
        </div>
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-icon storage">
              <HardDrive size={18} />
            </span>
          </div>
          <div className="stat-value">{storageLabel}</div>
          <div className="stat-label">Content Size</div>
        </div>
      </div>

      <div className="dashboard-bottom-grid">
        <div className="recent-docs-panel">
          <div className="panel-header">
            <h3>Recent Documents</h3>
            <button
              type="button"
              className="view-all-btn"
              onClick={() => onViewAllDocuments?.()}
            >
              View all
            </button>
          </div>

          <div className="recent-docs-list">
            {recent.length === 0 ? (
              <p className="dashboard-recent-empty">No documents yet. Open Documents to create one.</p>
            ) : (
              recent.map((doc) => {
                const tags = getDocTags(doc);
                const primary = tags[0];
                const iconStyle = primary
                  ? getCategoryIconStyle(primary)
                  : { backgroundColor: "var(--soft)", color: "var(--muted)" };
                const tagStyle = primary ? getCategoryTagStyle(primary) : null;
                const vis = primary ? resolveCategoryVisual(primary) : null;
                const isFav = !!favoritesMap[doc.id];

                return (
                  <button
                    key={String(doc.id)}
                    type="button"
                    className="recent-doc-item recent-doc-item-clickable"
                    onClick={() => onOpenDocument?.(Number(doc.id))}
                    style={
                      vis
                        ? ({
                          "--recent-cat-accent": vis.tagFg,
                        } as CSSProperties)
                        : undefined
                    }
                  >
                    <span className="recent-doc-icon-tile" style={iconStyle}>
                      <FileText size={16} />
                    </span>
                    <div className="doc-info">
                      <span className="doc-title">{doc.title || "Untitled"}</span>
                      <span className="doc-time">
                        {formatRelativeTime(doc.updatedAt ?? doc.createdAt)}
                      </span>
                    </div>
                    <div className="doc-tags">
                      {primary && tagStyle && (
                        <span className="tag" style={tagStyle}>
                          {primary}
                        </span>
                      )}
                      <Star
                        size={14}
                        className={`star-icon ${isFav ? "active" : ""}`}
                        fill={isFav ? "var(--gold)" : "none"}
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleFavorite(doc.id);
                        }}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="ai-activity-panel">
          <div className="quick-actions-panel">
            <h3>Quick Actions</h3>
            <div className="actions-grid">
              <button
                type="button"
                className="action-btn primary"
                onClick={() => void onNewDocument?.()}
              >
                + New Document
              </button>
              {isAdmin && onExport && (
                <button type="button" className="action-btn secondary" onClick={onExport}>
                  <Download size={16} /> Export JSON
                </button>
              )}
              {isAdmin && onImport && (
                <>
                  <button
                    type="button"
                    className="action-btn secondary"
                    ref={importBtnRef}
                    onClick={() => setShowImportMenu(true)}
                  >
                    <Upload size={16} /> Import
                  </button>
                  <Menu
                    open={showImportMenu}
                    onClose={() => setShowImportMenu(false)}
                    items={importMenuOptions}
                    anchorRef={importBtnRef}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
