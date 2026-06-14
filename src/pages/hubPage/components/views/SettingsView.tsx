import "./settings.scss";
import { useState } from "react";
import { User, Shield, BrainCircuit } from "lucide-react";
import { AccountSection } from "./settings/AccountSection";
import { UsersSection } from "./settings/UsersSection";
import { AISection } from "./settings/AISection";

type Tab = "account" | "users" | "ai";

export default function SettingsView({ isAdmin }: { isAdmin: boolean }) {
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
        {isAdmin && (
          <button
            type="button"
            className={`settings-tab ${tab === "users" ? "active" : ""}`}
            onClick={() => setTab("users")}
          >
            <Shield size={15} />
            Users
          </button>
        )}
        {isAdmin && (
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
        {tab === "users" && isAdmin && <UsersSection />}
        {tab === "ai" && isAdmin && <AISection />}
      </div>
    </div>
  );
}
