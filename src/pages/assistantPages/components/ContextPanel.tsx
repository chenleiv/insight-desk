import type { DocumentItem } from "../../../api/documentsClient";
import { DocumentRowSkeleton } from "../../../components/skeleton/Skeleton";
import { matchesQuery } from "../../documentsPages/utils/docs";
import { useAuth } from "../../../auth/useAuth";
import { Star } from "lucide-react";
import { useMemo, useState } from "react";

type Props = {
  docs: DocumentItem[];
  loading: boolean;
  selectedIds: number[];
  contextQuery: string;
  onToggleSelected: (id: number) => void;
  onChangeQuery: (value: string) => void;
  onClearSelection: () => void;
};

export default function ContextPanel({
  docs,
  loading,
  selectedIds,
  contextQuery,
  onToggleSelected,
  onChangeQuery,
  onClearSelection,
}: Props) {
  const { favoritesMap: favorites } = useAuth();

  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);

  const filteredDocs = useMemo(() => {
    let result = docs;

    if (showOnlyFavorites) {
      result = result.filter((d) => favorites[d.id]);
    }

    return result.filter((d) => matchesQuery(d, contextQuery));
  }, [docs, showOnlyFavorites, favorites, contextQuery]);

  const hasSelection = selectedIds.length > 0;

  const hint = hasSelection
    ? `Use selected documents. (${selectedIds.length} selected)`
    : "No selection — Use all documents.";

  function isSelected(id: number) {
    return selectedIds.includes(id);
  }

  function handleToggle(id: number) {
    onToggleSelected(id);
  }

  function handleClear() {
    onClearSelection();
  }

  return (
    <aside className="context-panel">
      {!hasSelection && (
        <div className="context-header-main">
          <div className="context-hint">
            Select documents to narrow context.
          </div>
        </div>
      )}
      {hasSelection && (
        <div className="context-header-main">
          <div className="context-hint">{hint}</div>
          <button
            className="text-btn"
            type="button"
            onClick={handleClear}
            disabled={loading}
          >
            Clear
          </button>
        </div>
      )}
      <div className="context-search">
        <input
          value={contextQuery}
          onChange={(e) => onChangeQuery(e.target.value)}
          placeholder="Search documents..."
          disabled={loading}
        />
        <button
          className={`favorite-button text-btn ${showOnlyFavorites ? "active" : ""}`}
          type="button"
          onClick={() => setShowOnlyFavorites((prev) => !prev)}
          title={
            showOnlyFavorites ? "Show all documents" : "Show only favorites"
          }
          aria-label={
            showOnlyFavorites ? "Show all documents" : "Show only favorites"
          }
        >
          <Star
            size={20}
            width={20}
            fill={showOnlyFavorites ? "currentColor" : "none"}
          />
        </button>
      </div>

      <div className="context-list">
        {loading && docs.length === 0 && (
          <>
            <DocumentRowSkeleton />
            <DocumentRowSkeleton />
            <DocumentRowSkeleton />
          </>
        )}

        {filteredDocs.map((d) => {
          const checked = isSelected(d.id);

          return (
            <div
              key={d.id}
              className={`context-item ${checked ? "checked" : ""}`}
              role="button"
              tabIndex={0}
              aria-pressed={checked}
              onClick={() => handleToggle(d.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleToggle(d.id);
                }
              }}
            >
              <div className="context-item-main">
                <div className="context-title-row">
                  {favorites[d.id] ? (
                    <div className="context-favorite">
                      <Star size={14} fill="currentColor" />
                    </div>
                  ) : (
                    <div className="context-favorite"></div>
                  )}
                  <div className="context-title">{d.title}</div>
                  <div className="context-meta">{d.category}</div>
                </div>
              </div>
            </div>
          );
        })}

        {!loading && filteredDocs.length === 0 && (
          <div className="empty">No documents match this search.</div>
        )}
      </div>
    </aside>
  );
}
