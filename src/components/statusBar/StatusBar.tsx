import type { StatusMessage } from "./statusTypes";
import "./statusBar.scss";

export default function StatusBar({
  message,
  onClose,
}: {
  message: StatusMessage | null;
  onClose: () => void;
}) {
  if (!message) return null;

  return (
    <div
      className={`statusbar statusbar-${message.kind}`}
      role="status"
      aria-live="polite"
    >
      <div className="statusbar-inner">
        <div className="statusbar-accent" />

        <div className="statusbar-icon" aria-hidden="true">
          {message.kind === "success"
            ? "✓"
            : message.kind === "error"
            ? "!"
            : "i"}
        </div>

        <div className="statusbar-text">
          {message.title ? (
            <div className="statusbar-title">{message.title}</div>
          ) : null}
          <div className="statusbar-message">{message.message}</div>
        </div>

        <div className="statusbar-actions">
          {message.actionLabel && message.onAction ? (
            <button
              type="button"
              className="statusbar-action"
              onClick={message.onAction}
            >
              {message.actionLabel}
            </button>
          ) : null}

          <button type="button" className="statusbar-close" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
