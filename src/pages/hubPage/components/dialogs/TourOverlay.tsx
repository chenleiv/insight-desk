import { useState, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import "./tourOverlay.scss";

export type TourPlacement = "right" | "left" | "bottom";

export type TourStep = {
  selector: string;
  title: string;
  description: string;
  placement: TourPlacement;
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;
const EDGE = 16;
// Matches .tour-callout width in tourOverlay.scss
const CALLOUT_W = 250;

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  // Capture phase also catches scrolling inside nested containers
  window.addEventListener("scroll", onChange, true);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("scroll", onChange, true);
  };
}

// Serialized to a string so an unchanged layout yields an equal snapshot
// and useSyncExternalStore does not re-render.
function getLayoutKey(selector: string): string {
  const viewport = `${window.innerWidth},${window.innerHeight}`;
  const el = document.querySelector(selector);
  if (!el) return viewport;
  const r = el.getBoundingClientRect();
  return `${viewport},${r.top},${r.left},${r.width},${r.height}`;
}

function parseLayoutKey(key: string): { vw: number; vh: number; rect: Rect | null } {
  const [vw, vh, top, left, width, height] = key.split(",").map(Number);
  const rect = top === undefined ? null : { top, left, width, height };
  return { vw, vh, rect };
}

type Props = {
  steps: TourStep[];
  onDone: () => void;
};

export function TourOverlay({ steps, onDone }: Props) {
  const [step, setStep] = useState(0);

  const current = steps[step];

  const layoutKey = useSyncExternalStore(
    subscribe,
    () => getLayoutKey(current.selector),
    () => ""
  );
  const { vw, vh, rect } = parseLayoutKey(layoutKey);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDone();
      if (e.key === "ArrowRight" && step < steps.length - 1) setStep((s) => s + 1);
      if (e.key === "ArrowLeft" && step > 0) setStep((s) => s - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, steps.length, onDone]);

  const isLast = step === steps.length - 1;

  const spotTop = (rect?.top ?? 0) - PAD;
  const spotLeft = (rect?.left ?? 0) - PAD;
  const spotW = (rect?.width ?? 0) + PAD * 2;
  const spotH = (rect?.height ?? 0) + PAD * 2;

  let calloutStyle: React.CSSProperties;
  if (!rect) {
    // Target not found: center the callout so the step is still readable
    calloutStyle = {
      top: Math.max(EDGE, vh / 2 - 90),
      left: Math.max(EDGE, (vw - CALLOUT_W) / 2),
    };
  } else if (current.placement === "right") {
    calloutStyle = {
      top: Math.max(16, spotTop + spotH / 2 - 90),
      left: spotLeft + spotW + 20,
    };
  } else if (current.placement === "left") {
    calloutStyle = {
      top: Math.max(16, spotTop + spotH / 2 - 90),
      left: Math.max(16, spotLeft - 280),
    };
  } else {
    calloutStyle = {
      top: spotTop + spotH + 16,
      left: Math.max(16, spotLeft + spotW / 2 - 125),
    };
  }
  // Keep the callout inside the right edge of the viewport
  if (typeof calloutStyle.left === "number") {
    calloutStyle.left = Math.max(EDGE, Math.min(calloutStyle.left, vw - CALLOUT_W - EDGE));
  }

  return createPortal(
    <div className={`tour-backdrop${rect ? "" : " tour-backdrop--dim"}`} onClick={onDone}>
      {rect && (
        <div
          className="tour-spotlight"
          style={{ top: spotTop, left: spotLeft, width: spotW, height: spotH }}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      <div
        className="tour-callout"
        style={calloutStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="tour-step-counter">{step + 1} / {steps.length}</p>
        <p className="tour-callout-title">{current.title}</p>
        <p className="tour-callout-desc" style={{ whiteSpace: "pre-line" }}>{current.description}</p>
        <div className="tour-callout-nav">
          {step > 0 && (
            <button type="button" className="tour-btn tour-btn--back" onClick={() => setStep((s) => s - 1)}>
              ← Back
            </button>
          )}
          <button
            type="button"
            className="tour-btn tour-btn--primary"
            onClick={isLast ? onDone : () => setStep((s) => s + 1)}
          >
            {isLast ? "Done ✓" : "Next →"}
          </button>
        </div>
      </div>

      <button type="button" className="tour-skip" onClick={onDone}>
        Skip tour
      </button>
    </div>,
    document.body
  );
}
