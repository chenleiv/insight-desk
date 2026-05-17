import {
  LayoutDashboard,
  Settings,
  LogOut,
  BrainCircuit,
  Moon,
  Sun,
  Bot,
  SidebarClose,
  SidebarOpen,
} from "lucide-react";
import { useAuth } from "../../../auth/useAuth";
import { useTheme } from "../../../hooks/useTheme";
import { getInitials } from "../../../utils/initials";

export type View = "dashboard" | "assistant" | "settings";

type Props = {
  view: View;
  onViewChange: (v: View) => void;
  isCollapsed?: boolean;
  onMobileClose?: () => void;
  onToggleCollapsed?: (() => void) | undefined;
};

const NAV_ITEMS: { id: View; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "assistant", label: "AI Assistant", icon: Bot },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function AppSidebar({
  view,
  onViewChange,
  isCollapsed,
  onMobileClose,
  onToggleCollapsed,
}: Props) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <aside className={`app-sidebar ${isCollapsed ? "collapsed" : ""}`}>

      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="logo-icon">
            <BrainCircuit size={18} />
          </div>
          {!isCollapsed && <span className="logo-text">InsightDesk</span>}
        </div>
      </div>

      <div className="app-sidebar-inner">
        <nav className="sidebar-nav">
          <ul className="nav-items">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  className={`nav-item ${view === id ? "active" : ""}`}
                  onClick={() => { onViewChange(id); onMobileClose?.(); }}
                  {...(isCollapsed ? { "data-tooltip": label, "data-tooltip-pos": "right" } : {})}
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
          {onToggleCollapsed && (
            <button
              type="button"
              className="sidebar-footer-btn"
              onClick={onToggleCollapsed}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              data-tooltip={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              data-tooltip-pos="right"
            >
              {isCollapsed ? <SidebarOpen size={18} /> : <SidebarClose size={18} />}
            </button>
          )}
          <button
            type="button"
            className="sidebar-footer-btn"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            data-tooltip={isDark ? "Light mode" : "Dark mode"}
            data-tooltip-pos="right"
          >
            {isDark ? <Sun size={18} strokeWidth={2} /> : <Moon size={18} strokeWidth={2} />}
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
    </aside>
  );
}
