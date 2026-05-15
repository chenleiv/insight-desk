import {
  FileText,
  LayoutDashboard,
  Star,
  Settings,
  LogOut,
  BrainCircuit,
  Moon,
  Sun,
  Bot,
} from "lucide-react";
import { useAuth } from "../../../auth/useAuth";
import { useTheme } from "../../../hooks/useTheme";
import { getInitials } from "../../../utils/initials";

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
  onMobileClose?: () => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  children?: React.ReactNode;
};

const WORKSPACE_ITEMS: { id: View; label: string; icon: React.ElementType }[] =
  [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "documents", label: "Documents", icon: FileText },
    { id: "favorites", label: "Favorites", icon: Star },
    { id: "assistant", label: "AI Assistant", icon: Bot },
  ];

export default function AppSidebar({
  view,
  onViewChange,
  sidebarOpen,
  isCollapsed,
  onMobileClose,
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
              <BrainCircuit size={18} />
            </div>
            {!isCollapsed && <span className="logo-text">InsightDesk</span>}
          </div>
        </div>

        <nav className="sidebar-nav">
          <ul className="nav-items">
            {WORKSPACE_ITEMS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  className={`nav-item ${view === id ? "active" : ""}`}
                  onClick={() => { onViewChange(id); onMobileClose?.(); }}
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
        <div className="sidebar-footer-actions">
          <button
            type="button"
            className="sidebar-footer-btn"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Light mode" : "Dark mode"}
          >
            {isDark ? <Sun size={18} strokeWidth={2} /> : <Moon size={18} strokeWidth={2} />}
          </button>
          <button
            type="button"
            className="sidebar-footer-btn"
            onClick={() => { onViewChange("settings"); onMobileClose?.(); }}
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={18} />
          </button>
        </div>

        <button
          className="sidebar-user-profile"
          aria-haspopup="menu"
          aria-label="User menu"
        >
          <div className="user-avatar">
            {user ? getInitials(user.displayName || user.email) : "?"}
          </div>
          {!isCollapsed && (
            <>
              <div className="user-info">
                <span className="user-name">
                  {user?.displayName || user?.email?.split("@")[0] || "User"}
                </span>
                <span className="user-email">
                  {user?.jobTitle || user?.email || ""}
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
