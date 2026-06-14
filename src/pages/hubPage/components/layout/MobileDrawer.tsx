import { LayoutDashboard, LogOut, Settings, X } from "lucide-react";
import { useAuth } from "../../../../auth/useAuth";
import { getInitials } from "../../../../utils/initials";

type Props = {
  onDashboard: () => void;
  onSettings: () => void;
  onClose: () => void;
};

export default function MobileDrawer({ onDashboard, onSettings, onClose }: Props) {
  const { user, logout } = useAuth();

  function handleDashboard() {
    onDashboard();
    onClose();
  }

  function handleSettings() {
    onSettings();
    onClose();
  }

  async function handleSignOut() {
    onClose();
    await logout();
  }

  return (
    <div className="mobile-drawer-overlay" onClick={onClose}>
      <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="mobile-drawer-header">
          <div className="mobile-drawer-user">
            <div className="mobile-drawer-avatar">
              {user ? getInitials(user.displayName || user.email) : "?"}
            </div>
            <div className="mobile-drawer-user-info">
              <span className="mobile-drawer-user-name">
                {user?.displayName || user?.email || "User"}
              </span>
              {user?.displayName && (
                <span className="mobile-drawer-user-email">{user.email}</span>
              )}
            </div>
          </div>
          <button
            type="button"
            className="mobile-drawer-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="mobile-drawer-nav">
          <button type="button" className="mobile-drawer-item" onClick={handleDashboard}>
            <LayoutDashboard size={16} />
            Dashboard
          </button>
          <button type="button" className="mobile-drawer-item" onClick={handleSettings}>
            <Settings size={16} />
            Settings
          </button>
        </nav>

        <div className="mobile-drawer-sep" />

        <button
          type="button"
          className="mobile-drawer-item mobile-drawer-item--danger"
          onClick={() => void handleSignOut()}
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </div>
  );
}
