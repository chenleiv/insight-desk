import UserMenu from "../userMenu/UserMenu";
import "../userMenu/userMenu.scss";
import { BrainCircuit, Moon, Sun } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";

export default function Header() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <header>
      <div className="header-left">
        <div className="header-title">
          <BrainCircuit size={22} />
          InsightDesk
        </div>
      </div>

      <div className="header-right">
        <button
          type="button"
          className="icon-btn"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          data-tooltip="Toggle theme"
          data-tooltip-pos="bottom"
        >
          {isDark ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
