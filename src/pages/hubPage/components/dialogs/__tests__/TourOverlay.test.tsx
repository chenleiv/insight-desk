import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TourOverlay, type TourStep } from "../TourOverlay";

const STEPS: TourStep[] = [
  { selector: ".target-a", title: "Step A", description: "First", placement: "right" },
  { selector: ".target-b", title: "Step B", description: "Second", placement: "bottom" },
];

type Box = { top: number; left: number; width: number; height: number };

// jsdom has no layout, so every element reports a zero-size rect.
// Map selectors to fixed boxes; the map can be changed mid-test.
const boxes = new Map<string, Box>();

function setBox(selector: string, box: Box) {
  boxes.set(selector, box);
}

function addTarget(className: string) {
  const el = document.createElement("div");
  el.className = className;
  document.body.appendChild(el);
  return el;
}

let container: HTMLDivElement;
let root: Root;

function render(ui: React.ReactNode) {
  act(() => root.render(ui));
}

function spotlight() {
  return document.querySelector<HTMLElement>(".tour-spotlight");
}

function callout() {
  return document.querySelector<HTMLElement>(".tour-callout");
}

function press(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key }));
  });
}

function click(selector: string) {
  act(() => {
    document.querySelector<HTMLElement>(selector)!.click();
  });
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    for (const [selector, b] of boxes) {
      if (this.matches(selector)) return new DOMRect(b.left, b.top, b.width, b.height);
    }
    return new DOMRect(0, 0, 0, 0);
  });
  setBox(".target-a", { top: 100, left: 50, width: 200, height: 40 });
  setBox(".target-b", { top: 300, left: 400, width: 100, height: 30 });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  boxes.clear();
  vi.restoreAllMocks();
});

describe("TourOverlay", () => {
  it("shows the first step with its counter and spotlight", () => {
    addTarget("target-a");
    render(<TourOverlay steps={STEPS} onDone={() => {}} />);

    expect(callout()?.textContent).toContain("Step A");
    expect(callout()?.textContent).toContain("1 / 2");
    expect(spotlight()?.style.top).toBe("92px");
    expect(spotlight()?.style.left).toBe("42px");
    expect(spotlight()?.style.width).toBe("216px");
    expect(spotlight()?.style.height).toBe("56px");
  });

  it("navigates with Next and Back, and Done calls onDone", () => {
    addTarget("target-a");
    addTarget("target-b");
    const onDone = vi.fn();
    render(<TourOverlay steps={STEPS} onDone={onDone} />);

    click(".tour-btn--primary");
    expect(callout()?.textContent).toContain("Step B");
    expect(spotlight()?.style.top).toBe("292px");

    click(".tour-btn--back");
    expect(callout()?.textContent).toContain("Step A");

    click(".tour-btn--primary");
    click(".tour-btn--primary");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("supports arrow keys and Escape", () => {
    addTarget("target-a");
    addTarget("target-b");
    const onDone = vi.fn();
    render(<TourOverlay steps={STEPS} onDone={onDone} />);

    press("ArrowRight");
    expect(callout()?.textContent).toContain("Step B");
    press("ArrowRight");
    expect(callout()?.textContent).toContain("Step B");
    press("ArrowLeft");
    expect(callout()?.textContent).toContain("Step A");
    press("Escape");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("finds a target that mounts in the same render as the tour", () => {
    render(
      <>
        <div className="target-a" />
        <TourOverlay steps={STEPS} onDone={() => {}} />
      </>
    );

    expect(spotlight()?.style.top).toBe("92px");
    expect(callout()?.textContent).toContain("Step A");
  });

  it("re-measures on window resize", () => {
    addTarget("target-a");
    render(<TourOverlay steps={STEPS} onDone={() => {}} />);

    setBox(".target-a", { top: 10, left: 20, width: 200, height: 40 });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(spotlight()?.style.top).toBe("2px");
    expect(spotlight()?.style.left).toBe("12px");
  });

  it("re-measures when a nested container scrolls", () => {
    const scroller = addTarget("scroller");
    addTarget("target-a");
    render(<TourOverlay steps={STEPS} onDone={() => {}} />);

    setBox(".target-a", { top: 40, left: 50, width: 200, height: 40 });
    act(() => {
      scroller.dispatchEvent(new Event("scroll"));
    });

    expect(spotlight()?.style.top).toBe("32px");
  });

  it("centers the callout on a dimmed backdrop when the target is missing", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1000);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
    render(<TourOverlay steps={STEPS} onDone={() => {}} />);

    expect(spotlight()).toBeNull();
    expect(callout()?.textContent).toContain("Step A");
    expect(callout()?.style.left).toBe("375px");
    expect(callout()?.style.top).toBe("310px");
    expect(document.querySelector(".tour-backdrop--dim")).not.toBeNull();
  });

  it("keeps the callout inside the right edge on narrow screens", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(400);
    setBox(".target-a", { top: 100, left: 200, width: 150, height: 40 });
    addTarget("target-a");
    render(<TourOverlay steps={STEPS} onDone={() => {}} />);

    // Unclamped "right" placement would put it at 200 + 150 + 8 + 20 = 378px
    expect(callout()?.style.left).toBe("134px");
    expect(document.querySelector(".tour-backdrop--dim")).toBeNull();
  });
});
