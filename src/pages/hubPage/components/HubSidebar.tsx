import { Search, Plus, Download, Upload, Star, X } from "lucide-react";
import React, { useState, useRef } from "react";
import Menu from "../../../components/menu/Menu";

type Props = {
  isAdmin: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  error: string | null;
  showForbidden: boolean;
  onCloseForbidden: () => void;
  onNew: () => void;
  onExport: () => void;
  onImport: (mode: "merge" | "replace") => void;
  showOnlyFavorites: boolean;
  onToggleFavorites: () => void;
  sidebarToggle?: React.ReactNode;
  onExpand?: () => void;
  children: React.ReactNode;
};

export default function HubSidebar({
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
  sidebarToggle,
  onExpand,
  children,
}: Props) {
  const [showImportMenu, setShowImportMenu] = useState(false);
  const importBtnRef = useRef<HTMLButtonElement>(null);

  const importMenuOptions = [
    {
      label: "Merge",
      onClick: () => {
        onImport("merge");
        setShowImportMenu(false);
      },
    },
    {
      label: "Replace",
      onClick: () => {
        onImport("replace");
        setShowImportMenu(false);
      },
      danger: true,
    },
  ];

  return (
    <div className="hub-sidebar-inner">
      <div className="sidebar-top demo-mobile-list-target">
        <div className="documents-header">
          <div className="header-title-row">
            <div className="header-actions">
              {sidebarToggle}
              {isAdmin && (
                <>
                  <button
                    className="icon-btn"
                    onClick={() => setShowImportMenu(true)}
                    data-tooltip="Import Menu"
                    data-tooltip-pos="bottom"
                    ref={importBtnRef}
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
              <button
                className="icon-btn"
                onClick={onExport}
                data-tooltip="Export"
                data-tooltip-pos="bottom"
              >
                <Download size={16} />
              </button>
              {isAdmin && (
                <>
                  <button
                    className="icon-btn"
                    onClick={onNew}
                    data-tooltip="New Document"
                    data-tooltip-pos="bottom"
                  >
                    <Plus size={20} />
                  </button>
                </>
              )}
            </div>
            <div className="sidebar-rotated-title" onClick={onExpand}>
              <h2>Insights Hub</h2>
            </div>
          </div>
        </div>

        <div className="search-row">
          <div className="search-input-wrap">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search documents..."
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
          </div>
          <button
            className={`favorite-toggle-btn ${showOnlyFavorites ? "active" : ""}`}
            onClick={onToggleFavorites}
            data-tooltip={showOnlyFavorites ? "Show all" : "Show favorites"}
            data-tooltip-pos="bottom"
          >
            <Star
              size={22}
              fill={showOnlyFavorites ? "currentColor" : "none"}
            />
          </button>
        </div>
      </div>

      {error && <div className="sidebar-error">{error}</div>}

      {showForbidden && (
        <div className="sidebar-alert forbidden">
          <span>Admin access required for this action.</span>
          <button onClick={onCloseForbidden}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="sidebar-list">{children}</div>
    </div>
  );
}
