import { useEffect, useRef, useState } from "react";
import { BarChart3, BrainCircuit, LayoutDashboard, LogOut, Moon, Settings, Sun } from "lucide-react";
import { useAuth } from "../../../../auth/useAuth";
import { useTheme } from "../../../../hooks/useTheme";
import { getInitials } from "../../../../utils/initials";

type Props = {
  activeView: string;
  onOpenDashboard: () => void;
  onOpenSettings: () => void;
  // Shown only to users who may read the quality metrics.
  onOpenQuality?: () => void;
  onOpenAI: () => void;
  isMobile: boolean;
  onSignOut: () => void;
};

export default function TopBar({ activeView, onOpenDashboard, onOpenSettings, onOpenQuality, onOpenAI, isMobile, onSignOut }: Props) {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  const isSecondaryView = activeView === "dashboard" || activeView === "settings" || activeView === "quality";

  return (
    <header className="hub-topbar">

      <div className="topbar-left">
        <div className="topbar-logo">
          <div className="topbar-logo-icon">
            <BrainCircuit size={18} />
          </div>
          <span className="topbar-logo-text">InsightDesk</span>
        </div>

        {!isMobile && (
          <>
            {isSecondaryView && (
              <button
                type="button"
                className="topbar-ask-insightdesk-btn"
                onClick={onOpenAI}
              >
                <BrainCircuit size={14} />
                <span>Ask Dex</span>
              </button>
            )}
            <div className="topbar-nav">
              <button
                type="button"
                className={`topbar-nav-btn${activeView === "dashboard" ? " active" : ""}`}
                onClick={onOpenDashboard}
              >
                <LayoutDashboard size={14} />
                <span className="topbar-nav-label">Dashboard</span>
              </button>
              {onOpenQuality && (
                <button
                  type="button"
                  className={`topbar-nav-btn${activeView === "quality" ? " active" : ""}`}
                  onClick={onOpenQuality}
                >
                  <BarChart3 size={14} />
                  <span className="topbar-nav-label">Quality</span>
                </button>
              )}
              <button
                type="button"
                className={`topbar-nav-btn${activeView === "settings" ? " active" : ""}`}
                onClick={onOpenSettings}
              >
                <Settings size={14} />
                <span className="topbar-nav-label">Settings</span>
              </button>
              <div className="topbar-divider" />
            </div>
          </>
        )}
      </div>

      <div className="topbar-actions">
        <button
          type="button"
          className="topbar-icon-btn"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          data-tooltip="Toggle theme"
          data-tooltip-pos="bottom"
        >
          {isDark ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
        </button>

        {!isMobile && (
          <div className="topbar-user-wrapper" ref={menuRef}>
            <button
              type="button"
              className="topbar-user-btn"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="User menu"
              aria-expanded={menuOpen}
            >
              <div className="topbar-avatar">
                {user ? getInitials(user.displayName || user.email) : "?"}
              </div>
            </button>

            {menuOpen && (
              <div className="topbar-user-menu">
                <div className="topbar-user-menu-info">
                  <span className="topbar-user-menu-name">
                    {user?.displayName || user?.email || "User"}
                  </span>
                  {user?.displayName && (
                    <span className="topbar-user-menu-email">{user.email}</span>
                  )}
                </div>
                <div className="topbar-user-menu-sep" />
                <button
                  type="button"
                  className="topbar-user-menu-item"
                  onClick={() => { setMenuOpen(false); onSignOut(); }}
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>

    </header>
  );
}
