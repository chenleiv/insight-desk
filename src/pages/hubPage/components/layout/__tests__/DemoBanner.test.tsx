import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import DemoBanner from "../DemoBanner";

const DETAILS = "Demo workspace: your own private copy of the sample documents, deleted when you sign out. "
  + "Edit, add and chat freely. "
  + "Limits: 20 documents, 20,000 characters and 1 attachment per document. Import and admin settings are disabled.";

let container: HTMLDivElement;
let root: Root;

const toggle = () => container.querySelector<HTMLButtonElement>(".demo-banner-toggle")!;
const details = () => container.querySelector<HTMLElement>(".demo-banner-details")!;

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
  it("shows the full text in one text node on wide screens", () => {
    act(() => root.render(<DemoBanner />));
    const span = container.querySelector(".demo-banner span")!;
    expect(span.textContent).toBe(DETAILS);
    expect(span.childNodes).toHaveLength(1);
    expect(toggle()).toBeNull();
  });

  it("starts as one line on phones, with the details hidden", () => {
    act(() => root.render(<DemoBanner compact />));
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(details().hidden).toBe(true);
  });

  it("opens and closes the details on tap", () => {
    act(() => root.render(<DemoBanner compact />));
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
