import React from "react";
import InlineBanner from "../../../components/banners/InlineBanner";
import DocumentsHeader from "./DocumentsHeader";
import { Star } from "lucide-react";

type Props = {
  isAdmin: boolean;

  query: string;
  onQueryChange: (v: string) => void;

  error: string | null;

  showForbidden: boolean;
  onCloseForbidden: () => void;

  onNew: () => void;
  onExport: () => void;
  onImport: (mode: "merge" | "replace") => void;
  showOnlyFavorites: boolean;
  onToggleFavorites: () => void;
  children: React.ReactNode;
};

export default function DocumentsSidebar({
  isAdmin,
  query,
  onQueryChange,
  error,
  showForbidden,
  onCloseForbidden,
  onNew,
  onExport,
  onImport,
  showOnlyFavorites,
  onToggleFavorites,
  children,
}: Props) {
  return (
    <div className="documents-sidebar-inner">
      {showForbidden && (
        <InlineBanner type="error">
          <div className="banner">
            <span>This section is available to admins only.</span>
            <button onClick={onCloseForbidden} type="button">
              ✕
            </button>
          </div>
        </InlineBanner>
      )}

      <div className="sidebar-top">
        <DocumentsHeader
          onNew={onNew}
          onExport={onExport}
          onImport={onImport}
          isAdmin={isAdmin}
        />

        <div className="search-row">
          <input
            type="text"
            placeholder="Search title, category, summary, content..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
          <button
            className={`favorite-button text-btn ${showOnlyFavorites ? "active" : ""}`}
            type="button"
            onClick={onToggleFavorites}
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

        {error ? <div className="error">{error}</div> : null}
      </div>

      <div className="sidebar-list">{children}</div>
    </div>
  );
}
