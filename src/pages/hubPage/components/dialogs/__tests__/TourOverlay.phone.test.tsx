import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TourOverlay, type TourPlacement, type TourStep } from "../TourOverlay";
import {
  DOC_TOUR_STEPS,
  HUB_TOUR_STEPS,
  MOBILE_DOC_TOUR_STEPS,
  MOBILE_HUB_TOUR_STEPS,
  MOBILE_NEW_DOC_TOUR_STEPS,
  NEW_DOC_TOUR_STEPS,
} from "../tourSteps";

const { screen } = vi.hoisted(() => ({ screen: { isMobile: true } }));
vi.mock("../../../../../hooks/useMobile", () => ({ useMobile: () => screen.isMobile }));

type Box = { top: number; left: number; width: number; height: number };

let container: HTMLDivElement;
let root: Root;
let targetBox: Box;

const callout = () => document.querySelector<HTMLElement>(".tour-callout")!;
const px = (value: string) => Number(value.replace("px", ""));

function setScreen(width: number, height: number) {
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(width);
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(height);
}

function renderTour(placement: TourPlacement, box: Box | null, onDone = vi.fn()) {
  if (box) {
    targetBox = box;
    const target = document.createElement("div");
    target.className = "target";
    document.body.appendChild(target);
  }
  const steps: TourStep[] = [
    { selector: ".target", title: "One", description: "First", placement },
    { selector: ".target", title: "Two", description: "Second", placement },
  ];
  act(() => root.render(<TourOverlay steps={steps} onDone={onDone} />));
  return onDone;
}

function click(selector: string) {
  act(() => { document.querySelector<HTMLElement>(selector)!.click(); });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  screen.isMobile = true;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (!this.matches(".target")) return new DOMRect(0, 0, 0, 0);
    return new DOMRect(targetBox.left, targetBox.top, targetBox.width, targetBox.height);
  });
  setScreen(360, 640);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("tour steps", () => {
  it.each([
    ["hub", HUB_TOUR_STEPS, MOBILE_HUB_TOUR_STEPS],
    ["document", DOC_TOUR_STEPS, MOBILE_DOC_TOUR_STEPS],
    ["new document", NEW_DOC_TOUR_STEPS, MOBILE_NEW_DOC_TOUR_STEPS],
  ])("%s has as many steps on a phone, so a rotation mid-tour keeps its place", (_name, wide, phone) => {
    expect(phone).toHaveLength(wide.length);
  });

  it("speak of tapping, not clicking", () => {
    for (const step of [...MOBILE_HUB_TOUR_STEPS, ...MOBILE_DOC_TOUR_STEPS, ...MOBILE_NEW_DOC_TOUR_STEPS]) {
      expect(step.description).not.toMatch(/click/i);
    }
  });
});

describe("TourOverlay on a phone: ending the tour", () => {
  it("ignores a tap on the backdrop", () => {
    const onDone = renderTour("top", { top: 500, left: 0, width: 72, height: 56 });
    click(".tour-backdrop");
    expect(onDone).not.toHaveBeenCalled();
    expect(callout().textContent).toContain("One");
  });

  it("reports skipped from the Skip button, which sits in the bubble", () => {
    const onDone = renderTour("top", { top: 500, left: 0, width: 72, height: 56 });
    expect(callout().querySelector(".tour-skip")).not.toBeNull();
    click(".tour-skip");
    expect(onDone).toHaveBeenCalledExactlyOnceWith("skipped");
  });

  it("reports completed from the last step", () => {
    const onDone = renderTour("top", { top: 500, left: 0, width: 72, height: 56 });
    click(".tour-btn--primary");
    click(".tour-btn--primary");
    expect(onDone).toHaveBeenCalledExactlyOnceWith("completed");
  });

  it("keeps the wider behaviour above the phone breakpoint", () => {
    screen.isMobile = false;
    const onDone = renderTour("right", { top: 100, left: 0, width: 72, height: 56 });
    expect(callout().querySelector(".tour-skip")).toBeNull();
    expect(callout().classList.contains("tour-callout--phone")).toBe(false);
    click(".tour-backdrop");
    expect(onDone).toHaveBeenCalledExactlyOnceWith("skipped");
  });
});

describe("TourOverlay on a phone: keeping the bubble on screen", () => {
  it("goes above a target at the bottom, limited to the room above it", () => {
    renderTour("top", { top: 584, left: 0, width: 72, height: 56 });
    const { bottom, left, width, top } = callout().style;
    // The spotlight starts at 576; the bubble ends 16px above that.
    expect(px(bottom)).toBe(640 - 576 + 16);
    expect(top).toBe("");
    expect(px(left)).toBe(16);
    expect(px(width)).toBe(320);
    expect(callout().style.getPropertyValue("--tour-room")).toBe("544px");
  });

  it("goes below a target at the top, limited to the room below it", () => {
    renderTour("bottom", { top: 60, left: 250, width: 90, height: 44 });
    const { top, left, bottom } = callout().style;
    expect(px(top)).toBe(60 + 44 + 8 + 16);
    expect(bottom).toBe("");
    // Centering on the target would pass the right edge.
    expect(px(left)).toBe(360 - 320 - 16);
    expect(callout().style.getPropertyValue("--tour-room")).toBe(`${640 - 128 - 16}px`);
  });

  it("switches sides when the asked side has no room", () => {
    renderTour("bottom", { top: 500, left: 0, width: 360, height: 40 });
    expect(callout().style.top).toBe("");
    expect(px(callout().style.bottom)).toBe(640 - 492 + 16);
  });

  it("docks over a target that leaves no room on either side", () => {
    renderTour("top", { top: 120, left: 16, width: 328, height: 420 });
    expect(callout().classList.contains("tour-callout--docked")).toBe(true);
    expect(callout().style.top).toBe("");
    expect(callout().style.bottom).toBe("");
    expect(px(callout().style.left)).toBe(20);
  });

  it("stays on screen for a target past the bottom edge", () => {
    renderTour("bottom", { top: 900, left: 0, width: 100, height: 40 });
    expect(px(callout().style.bottom)).toBe(16);
    expect(callout().style.getPropertyValue("--tour-room")).toBe("608px");
  });

  it("centers on the screen when the target is missing", () => {
    renderTour("top", null);
    expect(px(callout().style.left)).toBe(20);
    expect(px(callout().style.top)).toBe(230);
    expect(document.querySelector(".tour-backdrop--dim")).not.toBeNull();
  });

  it.each([
    [320, 288, 16],
    [360, 320, 20],
    [767, 320, 223.5],
  ])("at %ipx wide is %ipx wide and inside the edges", (vw, width, left) => {
    setScreen(vw, 640);
    renderTour("top", null);
    expect(px(callout().style.width)).toBe(width);
    expect(px(callout().style.left)).toBe(left);
  });
});

describe("TourOverlay on a phone: the page behind it", () => {
  it("closes the keyboard by taking focus from a field", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    renderTour("top", null);
    expect(document.activeElement).not.toBe(input);
  });

  it("leaves focus alone on wider screens", () => {
    screen.isMobile = false;
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    renderTour("right", null);
    expect(document.activeElement).toBe(input);
  });

  it("scrolls the target into view on phones only", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderTour("top", { top: 500, left: 0, width: 72, height: 56 });
    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "nearest" });

    act(() => root.unmount());
    root = createRoot(container);
    scrollIntoView.mockClear();
    screen.isMobile = false;
    renderTour("right", { top: 100, left: 0, width: 72, height: 56 });
    expect(scrollIntoView).not.toHaveBeenCalled();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });
});
