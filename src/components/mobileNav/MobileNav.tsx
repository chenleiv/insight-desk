import { NavLink } from "react-router-dom";
import { getNavLinkClass } from "../../utils/nav";
import { FileText, MessageSquare } from "lucide-react";
import "./mobileNav.scss";
import { useAuth } from "../../auth/useAuth";

export default function MobileNav() {
  const { isAuthed } = useAuth();

  if (!isAuthed) return null;

  return (
    <nav className="mobile-nav">
      <NavLink
        to="/documents"
        className={(props) => getNavLinkClass(props, "mobile-nav-item")}
      >
        <div className="icon">
          <FileText />
        </div>
        <span>Documents</span>
      </NavLink>
      <NavLink
        to="/assistant"
        className={(props) => getNavLinkClass(props, "mobile-nav-item")}
      >
        <div className="icon">
          <MessageSquare />
        </div>
        <span>Assistant</span>
      </NavLink>
    </nav>
  );
}
