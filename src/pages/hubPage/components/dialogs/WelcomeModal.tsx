import React from "react";
import { Upload, MessageCircle, Lightbulb, X } from "lucide-react";
import "./welcomeModal.scss";

type Props = {
  onClose: () => void;
};

const steps = [
  {
    icon: <Upload size={18} />,
    title: "Upload a document",
    sub: "PDF, Word, Excel — any format",
  },
  {
    icon: <MessageCircle size={18} />,
    title: "Ask questions",
    sub: "Chat with Brainy AI about the content",
  },
  {
    icon: <Lightbulb size={18} />,
    title: "Get insights",
    sub: "Summaries, analysis, Q&A",
  },
];

export const WelcomeModal: React.FC<Props> = ({ onClose }) => {
  return (
    <div className="welcome-overlay" onClick={onClose}>
      <div className="welcome-modal" onClick={(e) => e.stopPropagation()}>
        <button className="welcome-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        <div className="welcome-header">
          <span className="welcome-icon">✦</span>
          <h2 className="welcome-title">Welcome to Insight Desk</h2>
          <p className="welcome-sub">Your AI-powered document analysis workspace.</p>
        </div>

        <div className="welcome-steps">
          {steps.map((step, i) => (
            <div key={i} className="welcome-step">
              <div className="welcome-step-num">
                <span className="welcome-step-icon">{step.icon}</span>
              </div>
              <div className="welcome-step-text">
                <div className="welcome-step-title">{step.title}</div>
                <div className="welcome-step-sub">{step.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <button className="welcome-cta" onClick={onClose}>
          Get Started →
        </button>
      </div>
    </div>
  );
};
