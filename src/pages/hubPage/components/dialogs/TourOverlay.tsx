import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./tourOverlay.scss";

export type TourPlacement = "right" | "left" | "bottom";

export type TourStep = {
  selector: string;
  title: string;
  description: string;
  placement: TourPlacement;
};

export const HUB_TOUR_STEPS: TourStep[] = [
  {
    selector: ".doc-panel-wrapper",
    title: "📄 Document list",
    description:
      "All your documents live here. Click any document to open it.\n\n⭐ Star — mark as favourite\n🧠 Brain — add to Brainy AI context (so it can read it)",
    placement: "right",
  },
  {
    selector: ".hub-main",
    title: "🧠 Brainy AI",
    description:
      "Select one or more documents with the 🧠 brain icon, then ask Brainy anything about them — summaries, Q&A, comparisons.",
    placement: "left",
  },
  {
    selector: ".topbar-nav",
    title: "Navigation",
    description:
      "Dashboard — an overview of all your documents.\n\nSettings — theme, account details, and team members.",
    placement: "bottom",
  },
];

export const DOC_TOUR_STEPS: TourStep[] = [
  {
    selector: ".notion-doc-body",
    title: "✏️ Document editor",
    description:
      "Write notes, paste content, or import text from a file. Changes are saved automatically.",
    placement: "left",
  },
  {
    selector: ".notion-att-chips",
    title: "📎 Attachments",
    description:
      "Attach files here — PDF, Word, Excel. The text is extracted automatically so Brainy AI can read them.",
    placement: "left",
  },
];

export const NEW_DOC_TOUR_STEPS: TourStep[] = [
  {
    selector: ".notion-content-input",
    title: "✏️ Start writing",
    description:
      "Type your content here. Once the document is created, any changes you make are saved automatically - no need to press Save.",
    placement: "left",
  },
  {
    selector: ".doc-pane-import-btn",
    title: "Import text from file",
    description:
      "Click here to extract text from a PDF, Word, or Excel file and paste it straight into the document.",
    placement: "bottom",
  },
  {
    selector: ".notion-att-chip--add",
    title: "📎 Add file",
    description:
      "Attach a raw file to this document. Brainy AI will be able to read its contents.",
    placement: "right",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;

function getRect(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

type Props = {
  steps: TourStep[];
  onDone: () => void;
};

export function TourOverlay({ steps, onDone }: Props) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const current = steps[step];

  const measure = useCallback(() => {
    setRect(getRect(current.selector));
  }, [current.selector]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

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

  let calloutStyle: React.CSSProperties = {};
  if (rect) {
    if (current.placement === "right") {
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
  }

  return createPortal(
    <div className="tour-backdrop" onClick={onDone}>
      {rect && (
        <div
          className="tour-spotlight"
          style={{ top: spotTop, left: spotLeft, width: spotW, height: spotH }}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {rect && (
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
      )}

      <button type="button" className="tour-skip" onClick={onDone}>
        Skip tour
      </button>
    </div>,
    document.body
  );
}
