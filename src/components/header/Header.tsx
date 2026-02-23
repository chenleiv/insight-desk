import { useTheme } from "../../hooks/useTheme";
import ThemeToggle from "../../themeToggle/ThemeToggle";
import UserMenu from "../userMenu/UserMenu";
import "../userMenu/userMenu.scss";
import { BrainCircuit } from "lucide-react";

export default function Header() {
  const { theme, setTheme } = useTheme();

  return (
    <header>
      <div className="header-left">
        <div className="header-title">
          <BrainCircuit size={22} />
          InsightDesk
        </div>
      </div>

      <div className="header-right">
        <ThemeToggle value={theme} onChange={setTheme} />
        <UserMenu />
      </div>
    </header>
  );
}
