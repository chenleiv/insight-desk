import "./dashboard.scss";
import { useMemo, useRef, useState } from "react";
import { FileText, Star, Sparkles, HardDrive, Download, Upload } from "lucide-react";
import { useDocuments } from "../../../../context/DocumentsContext";
import { useAuth } from "../../../../auth/useAuth";
import { formatRelativeTime } from "../../../../utils/relativeTime";
import type { DocumentItem } from "../../../../api/documentsClient";
import { getDocTags, getCategoryIconStyle, getCategoryChipStyle } from "../../utils/docs";
import Menu from "../../../../components/menu/Menu";
import { Skeleton, SkeletonLine, SkeletonRegion } from "../../../../components/skeleton/Skeleton";
import { loadJson, scopedKey } from "../../../../utils/storage";
import { AI_QUERY_COUNT_BASE_KEY } from "./AIAssistantView";

type Props = {
  onNewDocument?: () => void | Promise<void>;
  onOpenDocument?: (id: string) => void;
  onExport?: () => void;
  onImport?: (mode: "append" | "replace", fileType: "json" | "text") => void;
  isExporting?: boolean;
  isImporting?: boolean;
  canEdit?: boolean;
  canCreate?: boolean;
  createDisabledLabel?: string;
  canImport?: boolean;
};

const RECENT_LIMIT = 5;

// Same classes as a recent document row, without the button behavior.
function RecentDocsSkeleton() {
  return (
    <SkeletonRegion label="Loading documents…" className="recent-docs-list">
      {Array.from({ length: RECENT_LIMIT }, (_, i) => (
        <div key={i} className="recent-doc-item recent-doc-item-clickable skeleton-static">
          <Skeleton className="recent-doc-icon-tile" />
          <div className="doc-info">
            <span className="doc-title"><SkeletonLine width="60%" /></span>
            <span className="doc-time"><SkeletonLine width="25%" /></span>
          </div>
          <div className="doc-tags">
            <Skeleton width={14} height={14} />
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}

function docTime(doc: DocumentItem): number {
  const t = doc.updatedAt ?? doc.createdAt;
  if (!t) return 0;
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? 0 : ms;
}

export default function DashboardView({
  onNewDocument,
  onOpenDocument,
  onExport,
  onImport,
  isExporting = false,
  isImporting = false,
  canEdit,
  canCreate = canEdit,
  createDisabledLabel = "Admin only",
  canImport = canEdit,
}: Props) {
  const [showImportMenu, setShowImportMenu] = useState(false);
  const importBtnRef = useRef<HTMLButtonElement>(null);

  const importMenuOptions = [
    {
      label: "JSON",
      onClick: () => { onImport?.("append", "json"); setShowImportMenu(false); },
    },
    {
      label: "TXT / MD",
      onClick: () => { onImport?.("append", "text"); setShowImportMenu(false); },
    },
  ];
  const { docs, loading } = useDocuments();
  const { user, favoritesMap, toggleFavorite } = useAuth();

  const displayName = (() => {
    if (user?.displayName) return user.displayName.split(" ")[0];
    const local = (user?.email ?? "").split("@")[0] || "there";
    return local.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).split(" ")[0];
  })();

  const recent = useMemo(() => {
    return [...docs].sort((a, b) => docTime(b) - docTime(a)).slice(0, RECENT_LIMIT);
  }, [docs]);

  const totalDocs = docs.length;
  const favoriteCount = useMemo(
    () => docs.filter((d) => favoritesMap[d.id]).length,
    [docs, favoritesMap]
  );

  const aiQueryCount = useMemo(
    () => loadJson<number>(scopedKey(AI_QUERY_COUNT_BASE_KEY, user?.email), 0),
    [user?.email]
  );

  const storageLabel = useMemo(() => {
    const bytes = docs.reduce((sum, d) => {
      return sum +
        (d.title?.length ?? 0) +
        (d.category?.length ?? 0) +
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
        <div className="dashboard-top-actions">
          <button
            type="button"
            className="action-btn primary"
            onClick={() => void onNewDocument?.()}
            disabled={!canCreate}
            title={canCreate ? undefined : createDisabledLabel}
          >
            + New Document
          </button>
          {onExport && (
            <button type="button" className="action-btn secondary" onClick={onExport}
              disabled={isExporting} aria-busy={isExporting}>
              <Download size={15} /> {isExporting ? "Exporting…" : "Export"}
            </button>
          )}
          {canEdit && onImport && (
            <>
              <button
                type="button"
                className="action-btn secondary"
                ref={importBtnRef}
                onClick={() => setShowImportMenu(true)}
                disabled={!canImport || isImporting}
                aria-busy={isImporting}
                title={canImport ? undefined : "Not available in the demo"}
              >
                <Upload size={15} /> {isImporting ? "Importing…" : "Import"}
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

      <div className="dashboard-stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-icon documents">
              <FileText size={18} />
            </span>
          </div>
          <div className="stat-value">{loading ? <SkeletonLine width="40%" /> : totalDocs}</div>
          <div className="stat-label">Total Documents</div>
        </div>
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-icon favorites">
              <Star size={18} />
            </span>
          </div>
          <div className="stat-value">{loading ? <SkeletonLine width="40%" /> : favoriteCount}</div>
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
          <div className="stat-value">{loading ? <SkeletonLine width="60%" /> : storageLabel}</div>
          <div className="stat-label">Content Size</div>
        </div>
      </div>

      <div className="dashboard-bottom-grid">
        <div className="recent-docs-panel">
          <div className="panel-header">
            <h3>Recent Documents</h3>
          </div>

          {loading ? (
            <RecentDocsSkeleton />
          ) : (
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
                  const isFav = !!favoritesMap[doc.id];

                  return (
                    <div key={String(doc.id)} className="recent-doc-item recent-doc-item-clickable recent-doc-row">
                      <button
                        type="button"
                        className="recent-doc-open"
                        onClick={() => onOpenDocument?.(doc.id)}
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
                          {primary && (
                            <span className="doc-panel-row-chip" style={getCategoryChipStyle(primary)}>
                              {primary}
                            </span>
                          )}
                        </div>
                      </button>
                      <button
                        type="button"
                        className="recent-doc-star"
                        onClick={() => void toggleFavorite(doc.id)}
                        aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                        aria-pressed={isFav}
                      >
                        <Star
                          size={14}
                          className={`star-icon ${isFav ? "active" : ""}`}
                          fill={isFav ? "var(--gold)" : "none"}
                          aria-hidden
                        />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
