import { useMemo, type CSSProperties } from "react";
import { FileText, Star, Sparkles, HardDrive, Download } from "lucide-react";
import { useDocuments } from "../../../context/DocumentsContext";
import { useAuth } from "../../../auth/useAuth";
import { formatRelativeTime } from "../../../utils/relativeTime";
import type { DocumentItem } from "../../../api/documentsClient";
import { getDocTags, getCategoryIconStyle, getCategoryTagStyle, resolveCategoryVisual } from "../utils/docs";

type Props = {
  onViewAllDocuments?: () => void;
  onNewDocument?: () => void | Promise<void>;
  onOpenDocument?: (id: number) => void;
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
}: Props) {
  const { docs } = useDocuments();
  const { user, favoritesMap, toggleFavorite } = useAuth();

  const displayName = useMemo(() => {
    const local = (user?.email ?? "").split("@")[0] || "there";
    return local.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }, [user?.email]);

  const recent = useMemo(() => {
    return [...docs].sort((a, b) => docTime(b) - docTime(a)).slice(0, 5);
  }, [docs]);

  const totalDocs = docs.length;
  const favoriteCount = useMemo(
    () => docs.filter((d) => favoritesMap[d.id]).length,
    [docs, favoritesMap]
  );

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
          <div className="stat-value">—</div>
          <div className="stat-label">AI Queries</div>
        </div>
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-icon storage">
              <HardDrive size={18} />
            </span>
          </div>
          <div className="stat-value">—</div>
          <div className="stat-label">Storage Used</div>
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
              <button type="button" className="action-btn secondary">
                <Download size={16} /> Import JSON
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
