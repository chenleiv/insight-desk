import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { StatusMessage } from "./statusTypes";
import "./statusBar.scss";

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function StatusCard({
  message,
  onClose,
}: {
  message: StatusMessage;
  onClose: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const pageHidden = useSyncExternalStore(subscribeToVisibility, () => document.hidden);
  const paused = hovered || focused || pageHidden;

  const timeoutMs = message.timeoutMs ?? 0;
  const remainingRef = useRef(timeoutMs);

  useEffect(() => {
    if (paused || timeoutMs <= 0) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(onClose, remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current -= Date.now() - startedAt;
    };
  }, [paused, timeoutMs, onClose]);

  return (
    <div
      className={`statusbar statusbar-${message.kind}`}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
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

          <button
            type="button"
            className="statusbar-close"
            aria-label="Dismiss notification"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StatusBar({
  message,
  onClose,
}: {
  message: StatusMessage | null;
  onClose: () => void;
}) {
  // Keyed so a new message starts with a full timer and no pause left from the previous one.
  const card = message ? <StatusCard key={message.id} message={message} onClose={onClose} /> : null;
  const isError = message?.kind === "error";

  // The regions stay mounted while empty: screen readers can miss a region inserted with its content.
  return (
    <>
      <div role="status" aria-live="polite">{isError ? null : card}</div>
      <div role="alert" aria-live="assertive">{isError ? card : null}</div>
    </>
  );
}
