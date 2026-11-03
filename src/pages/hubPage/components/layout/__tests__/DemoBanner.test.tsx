import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import DemoBanner from "../DemoBanner";

const DETAILS = "Demo workspace: your own private copy of the sample documents, reset when you sign out. "
  + "Edit, add and chat freely. "
  + "Limits: 20 documents, 20,000 characters and 1 attachment per document. Import and admin settings are disabled.";

let container: HTMLDivElement;
let root: Root;

const toggle = () => container.querySelector<HTMLButtonElement>(".demo-banner-toggle")!;
const details = () => container.querySelector<HTMLElement>(".demo-banner-details")!;
const summary = () => container.querySelector(".demo-banner-summary")!;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("DemoBanner", () => {
  it.each([
    ["wide screens", false, "Demo workspace · Your changes reset when you sign out · Details"],
    ["phones", true, "Demo workspace · Details"],
  ])("starts as one text node on %s, with the details hidden", (_name, compact, text) => {
    act(() => root.render(<DemoBanner compact={compact} />));
    expect(summary().textContent).toBe(text);
    expect(summary().childNodes).toHaveLength(1);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(details().hidden).toBe(true);
  });

  it("is a real button, so the keyboard can reach and press it", () => {
    act(() => root.render(<DemoBanner />));
    expect(toggle().tagName).toBe("BUTTON");
    expect(toggle().type).toBe("button");
    toggle().focus();
    expect(document.activeElement).toBe(toggle());
  });

  it("collapses again on a new load", () => {
    act(() => root.render(<DemoBanner />));
    act(() => toggle().click());
    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<DemoBanner />));
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  it.each([[false], [true]])("opens and closes the same details (compact: %s)", (compact) => {
    act(() => root.render(<DemoBanner compact={compact} />));
    act(() => toggle().click());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(details().hidden).toBe(false);
    expect(details().textContent).toBe(DETAILS);
    expect(details().childNodes).toHaveLength(1);
    expect(toggle().getAttribute("aria-controls")).toBe(details().id);

    act(() => toggle().click());
    expect(details().hidden).toBe(true);
  });
});
