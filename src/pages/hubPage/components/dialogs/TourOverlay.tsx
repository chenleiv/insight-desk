import { useState, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useMobile } from "../../../../hooks/useMobile";
import "./tourOverlay.scss";

export type TourPlacement = "right" | "left" | "bottom" | "top";

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
const PHONE_CALLOUT_W = 320;
const PHONE_GAP = 16;
// With less room than this on both sides of the target, the bubble goes over the target.
const PHONE_MIN_ROOM = 200;

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  // Capture phase also catches scrolling inside nested containers
  window.addEventListener("scroll", onChange, true);
  // iOS moves only the visual viewport when the on-screen keyboard closes.
  window.visualViewport?.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("scroll", onChange, true);
    window.visualViewport?.removeEventListener("resize", onChange);
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

// The bubble's height depends on its text, so it gets the room on its side as a limit and scrolls
// inside it. --tour-room is read by .tour-callout--phone, which also takes off the safe areas.
function phoneCallout(
  placement: TourPlacement,
  spot: { top: number; bottom: number; left: number; right: number } | null,
  vw: number,
  vh: number
): { style: React.CSSProperties; docked: boolean } {
  const width = Math.min(PHONE_CALLOUT_W, vw - EDGE * 2);
  const withRoom = (style: React.CSSProperties, room: number) =>
    ({ width, ...style, "--tour-room": `${room}px` }) as React.CSSProperties;

  if (!spot) {
    const top = Math.max(EDGE, vh / 2 - 90);
    return { style: withRoom({ top, left: (vw - width) / 2 }, vh - top - EDGE), docked: false };
  }

  const centered = (spot.left + spot.right) / 2 - width / 2;
  const left = Math.max(EDGE, Math.min(centered, vw - width - EDGE));
  // A target that is partly off screen still has its bubble on screen.
  const top = Math.max(0, Math.min(spot.top, vh));
  const bottom = Math.max(0, Math.min(spot.bottom, vh));
  const above = top - PHONE_GAP - EDGE;
  const below = vh - bottom - PHONE_GAP - EDGE;

  if (Math.max(above, below) < PHONE_MIN_ROOM) {
    return { style: withRoom({ left }, vh - EDGE * 2), docked: true };
  }

  const wantsAbove = placement === "top";
  const useAbove = (wantsAbove ? above : below) >= PHONE_MIN_ROOM ? wantsAbove : !wantsAbove;
  const style = useAbove
    ? withRoom({ bottom: vh - top + PHONE_GAP, left }, above)
    : withRoom({ top: bottom + PHONE_GAP, left }, below);
  return { style, docked: false };
}

export type TourOutcome = "completed" | "skipped";

type Props = {
  steps: TourStep[];
  onDone: (outcome: TourOutcome) => void;
};

export function TourOverlay({ steps, onDone }: Props) {
  const isPhone = useMobile();
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
      if (e.key === "Escape") onDone("skipped");
      if (e.key === "ArrowRight" && step < steps.length - 1) setStep((s) => s + 1);
      if (e.key === "ArrowLeft" && step > 0) setStep((s) => s - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, steps.length, onDone]);

  // The keyboard would cover the bubble and hide the bottom nav the steps point at.
  useEffect(() => {
    if (isPhone && document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, [isPhone]);

  useEffect(() => {
    if (isPhone) document.querySelector(current.selector)?.scrollIntoView?.({ block: "nearest" });
  }, [isPhone, current.selector]);

  const isLast = step === steps.length - 1;

  const spotTop = (rect?.top ?? 0) - PAD;
  const spotLeft = (rect?.left ?? 0) - PAD;
  const spotW = (rect?.width ?? 0) + PAD * 2;
  const spotH = (rect?.height ?? 0) + PAD * 2;

  let calloutStyle: React.CSSProperties;
  let docked = false;
  if (isPhone) {
    const spot = rect && {
      top: spotTop,
      bottom: spotTop + spotH,
      left: spotLeft,
      right: spotLeft + spotW,
    };
    ({ style: calloutStyle, docked } = phoneCallout(current.placement, spot, vw, vh));
  } else if (!rect) {
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
  } else if (current.placement === "top") {
    calloutStyle = {
      bottom: vh - spotTop + 16,
      left: Math.max(16, spotLeft + spotW / 2 - 125),
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

  const skipButton = (
    <button
      type="button"
      className="tour-skip"
      onClick={(e) => {
        e.stopPropagation();
        onDone("skipped");
      }}
    >
      Skip tour
    </button>
  );

  return createPortal(
    // On phones a stray tap must not end every guide, so only the Skip button does.
    <div
      className={`tour-backdrop${rect ? "" : " tour-backdrop--dim"}`}
      onClick={isPhone ? undefined : () => onDone("skipped")}
    >
      {rect && (
        <div
          className="tour-spotlight"
          style={{ top: spotTop, left: spotLeft, width: spotW, height: spotH }}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      <div
        className={`tour-callout${isPhone ? " tour-callout--phone" : ""}${docked ? " tour-callout--docked" : ""}`}
        style={calloutStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="tour-step-counter">{step + 1} / {steps.length}</p>
        <p className="tour-callout-title">{current.title}</p>
        <p className="tour-callout-desc" style={{ whiteSpace: "pre-line" }}>{current.description}</p>
        <div className="tour-callout-nav">
          {/* In the bubble on phones: at the bottom of the screen it would cover the bottom nav. */}
          {isPhone && skipButton}
          {step > 0 && (
            <button type="button" className="tour-btn tour-btn--back" onClick={() => setStep((s) => s - 1)}>
              ← Back
            </button>
          )}
          <button
            type="button"
            className="tour-btn tour-btn--primary"
            onClick={isLast ? () => onDone("completed") : () => setStep((s) => s + 1)}
          >
            {isLast ? "Done ✓" : "Next →"}
          </button>
        </div>
      </div>

      {!isPhone && skipButton}
    </div>,
    document.body
  );
}
