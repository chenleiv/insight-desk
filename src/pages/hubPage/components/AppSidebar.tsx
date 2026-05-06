import {
  FileText,
  LayoutDashboard,
  Star,
  Settings,
  LogOut,
  BrainCircuit,
  Pin,
  ChevronRight,
  Moon,
  Sun,
  Bot,
} from "lucide-react";
import { useAuth } from "../../../auth/useAuth";
import { useTheme } from "../../../hooks/useTheme";

export type View =
  | "dashboard"
  | "documents"
  | "favorites"
  | "assistant"
  | "settings";

type Props = {
  view: View;
  onViewChange: (v: View) => void;
  query: string;
  onQueryChange: (q: string) => void;
  onNew: () => void;
  recentDocs: { id: number; title: string }[];
  sidebarOpen: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  children?: React.ReactNode;
};

const WORKSPACE_ITEMS: { id: View; label: string; icon: React.ElementType }[] =
  [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "documents", label: "Documents", icon: FileText },
    { id: "favorites", label: "Favorites", icon: Star },
    { id: "assistant", label: "AI Assistant", icon: Bot },
    { id: "settings", label: "Settings", icon: Settings },
  ];

function getInitials(email: string) {
  const name = (email || "").split("@")[0] || "U";
  const parts = name.split(/[.\-_]/).filter(Boolean);
  const first = (parts[0]?.[0] ?? name[0] ?? "U").toUpperCase();
  const second = (parts[1]?.[0] ?? name[1] ?? "").toUpperCase();
  return (first + second).trim();
}

export default function AppSidebar({
  view,
  onViewChange,
  sidebarOpen,
  isCollapsed,
  onToggleCollapse,
  children,
}: Props) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <aside className={`app-sidebar ${!sidebarOpen ? "closed" : ""} ${isCollapsed ? "collapsed" : ""}`}>
      <div className="app-sidebar-inner">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-icon">
              <BrainCircuit size={20} />
            </div>
            {!isCollapsed && <span className="logo-text">InsightDesk</span>}
          </div>
          <div className="sidebar-header-actions">
            <button
              type="button"
              className={`sidebar-theme-btn ${isDark ? "is-dark" : "is-light"}`}
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
              aria-pressed={isDark}
              title={isDark ? "Light mode" : "Dark mode"}
            >
              {isDark ? (
                <Sun size={18} strokeWidth={2} aria-hidden />
              ) : (
                <Moon size={18} strokeWidth={2} aria-hidden />
              )}
            </button>
          </div>
        </div>

        <nav className="sidebar-nav">
          <ul className="nav-items">
            {WORKSPACE_ITEMS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  className={`nav-item ${view === id ? "active" : ""}`}
                  onClick={() => onViewChange(id)}
                  title={isCollapsed ? label : undefined}
                >
                  <Icon size={18} />
                  {!isCollapsed && <span>{label}</span>}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="sidebar-footer">
        {onToggleCollapse && (
          <button
            className="sidebar-collapse-btn"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? "Expand sidebar" : "Pin sidebar"}
            title={isCollapsed ? "Expand sidebar" : "Pin sidebar"}
          >
            {isCollapsed ? <ChevronRight size={18} /> : <Pin size={16} />}
            {!isCollapsed && <span>Pin sidebar</span>}
          </button>
        )}

        <button
          className="sidebar-user-profile"
          aria-haspopup="menu"
          aria-label="User menu"
        >
          <div className="user-avatar">
            {user ? getInitials(user.email) : "CL"}
          </div>
          {!isCollapsed && (
            <>
              <div className="user-info">
                <span className="user-name">Chen Lei</span>
                <span className="user-email">
                  {user?.email || "chen@insightdesk.io"}
                </span>
              </div>
              <LogOut
                size={16}
                className="user-logout-icon"
                onClick={() => logout()}
              />
            </>
          )}
        </button>
      </div>
      {children}
    </aside>
  );
}
