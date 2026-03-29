import UserMenu from "../userMenu/UserMenu";
import "../userMenu/userMenu.scss";
import { BrainCircuit } from "lucide-react";

export default function Header() {
  return (
    <header>
      <div className="header-left">
        <div className="header-title">
          <BrainCircuit size={22} />
          InsightDesk
        </div>
      </div>

      <div className="header-right">
        <UserMenu />
      </div>
    </header>
  );
}
