import { useEffect, useRef, useState } from "react";
import { BrainCircuit, FileText, LayoutDashboard, LogOut, Menu, Moon, Settings, Sun } from "lucide-react";
import { useAuth } from "../../../../auth/useAuth";
import { useTheme } from "../../../../hooks/useTheme";
import { getInitials } from "../../../../utils/initials";

type Props = {
  activeView: string;
  onOpenDashboard: () => void;
  onOpenSettings: () => void;
  onOpenAI: () => void;
  onOpenDocPicker?: () => void;
  isMobile: boolean;
  onMenuClick: () => void;
};

export default function TopBar({ activeView, onOpenDashboard, onOpenSettings, onOpenAI, onOpenDocPicker, isMobile, onMenuClick }: Props) {
  const { user, logout } = useAuth();
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
            {(activeView === "dashboard" || activeView === "settings") && (
              <button
                type="button"
                className="topbar-ask-brainy-btn"
                onClick={onOpenAI}
              >
                <BrainCircuit size={14} />
                <span>Ask Brainy</span>
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
        {isMobile && (activeView === "dashboard" || activeView === "settings") && (
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={onOpenAI}
            aria-label="Ask Brainy"
            data-tooltip="Ask Brainy"
            data-tooltip-pos="bottom"
          >
            <BrainCircuit size={16} />
          </button>
        )}
        {isMobile && onOpenDocPicker && (
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={onOpenDocPicker}
            aria-label="Open documents"
            data-tooltip="Documents"
            data-tooltip-pos="bottom"
          >
            <FileText size={16} />
          </button>
        )}

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
                  onClick={() => { setMenuOpen(false); void logout(); }}
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}

        {isMobile && (
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={onMenuClick}
            aria-label="Menu"
          >
            <Menu size={16} strokeWidth={2} />
          </button>
        )}
      </div>

    </header>
  );
}
