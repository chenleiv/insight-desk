import React from "react";
import { X } from "lucide-react";
import "./welcomeModal.scss";

type Props = {
  onClose: () => void;
  onStartTour: () => void;
};

export const WelcomeModal: React.FC<Props> = ({ onClose, onStartTour }) => (
  <div className="welcome-overlay" onClick={onClose}>
    <div
      className="welcome-modal"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <button className="welcome-close" onClick={onClose} aria-label="Close">
        <X size={16} />
      </button>

      <div className="welcome-header">
        <span className="welcome-sparkle">✦</span>
        <h2 className="welcome-title" id="welcome-title">Welcome to Insight Desk</h2>
        <p className="welcome-sub">Your AI-powered document workspace.</p>
      </div>

      <div className="welcome-actions">
        <button className="welcome-cta" onClick={() => { onClose(); onStartTour(); }}>
          Show me around →
        </button>
        <button className="welcome-skip" onClick={onClose}>
          I'll explore on my own
        </button>
      </div>
    </div>
  </div>
);
