import "./settings.scss";
import { useState } from "react";
import { User, Shield, BrainCircuit } from "lucide-react";
import { AccountSection } from "./settings/AccountSection";
import { UsersSection } from "./settings/UsersSection";
import { AISection } from "./settings/AISection";

type Tab = "account" | "users" | "ai";

type Props = {
  showAdminTabs: boolean;
  // Demo visitors see the admin tabs but cannot change anything.
  adminReadOnly: boolean;
};

export default function SettingsView({ showAdminTabs, adminReadOnly }: Props) {
  const [tab, setTab] = useState<Tab>("account");

  return (
    <div className="settings-view">
      <div className="settings-tabs">
        <button
          type="button"
          className={`settings-tab ${tab === "account" ? "active" : ""}`}
          onClick={() => setTab("account")}
        >
          <User size={15} />
          Account
        </button>
        {showAdminTabs && (
          <button
            type="button"
            className={`settings-tab ${tab === "users" ? "active" : ""}`}
            onClick={() => setTab("users")}
          >
            <Shield size={15} />
            Users
          </button>
        )}
        {showAdminTabs && (
          <button
            type="button"
            className={`settings-tab ${tab === "ai" ? "active" : ""}`}
            onClick={() => setTab("ai")}
          >
            <BrainCircuit size={15} />
            AI
          </button>
        )}
      </div>

      <div className="settings-content">
        {tab === "account" && <AccountSection />}
        {tab === "users" && showAdminTabs && <UsersSection readOnly={adminReadOnly} />}
        {tab === "ai" && showAdminTabs && <AISection readOnly={adminReadOnly} />}
      </div>
    </div>
  );
}
