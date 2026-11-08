import { BarChart3, BrainCircuit, FileText, LayoutDashboard, Settings, type LucideIcon } from "lucide-react";
import type { ActiveView } from "../../utils/hubView";

export type BottomNavTab = "ai" | "documents" | "dashboard" | "quality" | "settings";

const TABS: { id: BottomNavTab; label: string; Icon: LucideIcon }[] = [
  { id: "ai", label: "Assistant", Icon: BrainCircuit },
  { id: "documents", label: "Documents", Icon: FileText },
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "quality", label: "Quality", Icon: BarChart3 },
  { id: "settings", label: "Settings", Icon: Settings },
];

// An open document and the new-document form belong to the Documents tab.
function tabForView(view: ActiveView["kind"]): BottomNavTab {
  return view === "doc" || view === "creating" || view === "new" ? "documents" : view;
}

type Props = {
  activeView: ActiveView["kind"];
  // Shown only to users who may read the quality metrics.
  showQuality: boolean;
  onSelect: (tab: BottomNavTab) => void;
};

export default function BottomNav({ activeView, showQuality, onSelect }: Props) {
  const activeTab = tabForView(activeView);

  return (
    <nav className="bottom-nav" aria-label="Main">
      {TABS.filter((tab) => tab.id !== "quality" || showQuality).map(({ id, label, Icon }) => {
        const isActive = id === activeTab;
        return (
          <button
            key={id}
            type="button"
            className={`bottom-nav-item bottom-nav-item--${id}${isActive ? " active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onSelect(id)}
          >
            <Icon size={20} aria-hidden />
            <span className="bottom-nav-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
