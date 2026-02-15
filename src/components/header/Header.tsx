import { NavLink } from "react-router-dom";
import { useTheme } from "../../hooks/useTheme";
import ThemeToggle from "../../themeToggle/ThemeToggle";
import UserMenu from "../userMenu/UserMenu";
import "../userMenu/userMenu.scss";
import { useAuth } from "../../auth/useAuth";
import { BrainCircuit } from "lucide-react";
import { useMobile } from "../../hooks/useMobile";

export default function Header() {
  const { theme, setTheme } = useTheme();
  const { isAuthed } = useAuth();
  const isMobile = useMobile();

  return (
    <header>
      <div className="header-left">
        <div className="header-title">
          <BrainCircuit size={22} />
          InsightDesk
        </div>
      </div>

      {isAuthed && !isMobile && (
        <nav>
          <NavLink
            className={({ isActive }) =>
              `nav-link${isActive ? " is-active" : ""}`
            }
            to="/documents"
          >
            Documents
          </NavLink>
          <NavLink
            className={({ isActive }) =>
              `nav-link${isActive ? " is-active" : ""}`
            }
            to="/assistant"
          >
            AI Assistant
          </NavLink>
        </nav>
      )}

      <div className="header-right">
        <ThemeToggle value={theme} onChange={setTheme} />
        <UserMenu />
      </div>
    </header>
  );
}
