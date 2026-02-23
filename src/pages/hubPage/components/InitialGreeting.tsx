// import "../assistantPage.scss";
import { PanelLeft } from "lucide-react";

type Props = {
  onSelectDocuments: () => void;
};

export default function InitialGreeting({ onSelectDocuments }: Props) {
  return (
    <div className="initial-greeting-container">
      <div className="initial-greeting-desktop">
        <p className="greeting-title">Welcome to AI Hub</p>
        <p className="greeting-body">
          I'm an intelligent assistant capable of analyzing and extracting
          knowledge from your documents.
        </p>
        <p className="greeting-body" style={{ marginTop: "8px" }}>
          To begin, select documents from the sidebar to provide context, and
          ask me a question below.
        </p>
      </div>
      <div className="initial-greeting-mobile">
        <p className="greeting-title">Welcome to AI Hub</p>
        <p className="greeting-body">
          I can analyze and extract knowledge from your workspace.
        </p>
        <button className="greeting-button" onClick={onSelectDocuments}>
          Select Context <PanelLeft size={18} />
        </button>
      </div>
    </div>
  );
}
