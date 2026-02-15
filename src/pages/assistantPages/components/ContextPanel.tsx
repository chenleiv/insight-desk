import type { DocumentItem } from "../../../api/documentsClient";
import { DocumentRowSkeleton } from "../../../components/skeleton/Skeleton";
import { useAuth } from "../../../auth/useAuth";
import { Star } from "lucide-react";

type Props = {
  docs: DocumentItem[];
  loading: boolean;
  error: string | null;

  selectedIds: number[];
  contextQuery: string;

  onToggleSelected: (id: number) => void;
  onChangeQuery: (value: string) => void;
  onClearSelection: () => void;
};

function matchesQuery(d: DocumentItem, q: string) {
  const title = (d.title ?? "").toLowerCase();
  const category = (d.category ?? "").toLowerCase();
  const summary = (d.summary ?? "").toLowerCase();

  return title.includes(q) || category.includes(q) || summary.includes(q);
}

export default function ContextPanel({
  docs,
  loading,
  error,
  selectedIds,
  contextQuery,
  onToggleSelected,
  onChangeQuery,
  onClearSelection,
}: Props) {
  const { favoritesMap: favorites } = useAuth();

  const filteredDocs = (() => {
    const q = contextQuery.toLowerCase().trim();
    if (!q) return docs;
    return docs.filter((d) => matchesQuery(d, q));
  })();

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
      </div>

      {error && <div className="error">{error}</div>}

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
