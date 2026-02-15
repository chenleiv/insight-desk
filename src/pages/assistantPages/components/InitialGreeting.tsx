import "../assistantPage.scss";
import { PanelLeft } from "lucide-react";

type Props = {
  onSelectDocuments: () => void;
};

export default function InitialGreeting({ onSelectDocuments }: Props) {
  return (
    <div className="initial-greeting-container">
      <div className="initial-greeting-mobile">
        <p className="greeting-title">How can I help you?</p>
        <p className="greeting-body">
          To focus my search, you can select specific documents from the list.
        </p>
        <button className="greeting-button" onClick={onSelectDocuments}>
          Select documents <PanelLeft size={20} />
        </button>
      </div>
      <div className="initial-greeting-desktop">
        <p className="greeting-title">How can I help you?</p>
        To focus my search, you can select specific documents from the list.
      </div>
    </div>
  );
}
