import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import Menu from "../Menu";

type Placement = "below" | "above";

let root: Root;
let container: HTMLDivElement;

function Harness({ placement }: { placement?: Placement }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={anchorRef} className="anchor" />
      <Menu
        open
        onClose={() => {}}
        anchorRef={anchorRef}
        items={[{ label: "One", onClick: () => {} }]}
        {...(placement ? { placement } : {})}
      />
    </>
  );
}

const menu = () => document.querySelector<HTMLElement>('[role="menu"]')!;

function renderAt(anchorTop: number, menuHeight: number, placement?: Placement) {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(menuHeight);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(300, anchorTop, 44, 44));
  act(() => root.render(<Harness {...(placement ? { placement } : {})} />));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(360);
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(640);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("Menu placement", () => {
  it("opens above the anchor when asked, ending the offset above it", () => {
    renderAt(560, 100, "above");
    expect(menu().style.top).toBe(`${560 - 8 - 100}px`);
    expect(menu().style.maxHeight).toBe(`${560 - 8 - 8}px`);
    expect(menu().classList.contains("menu--above")).toBe(true);
  });

  it("stays on screen and scrolls when there is less room than it needs", () => {
    renderAt(80, 100, "above");
    expect(menu().style.top).toBe("8px");
    expect(menu().style.maxHeight).toBe("64px");
    expect(menu().style.overflowY).toBe("auto");
  });

  it("stays inside the right edge", () => {
    renderAt(560, 100, "above");
    expect(parseFloat(menu().style.left) + 180).toBeLessThanOrEqual(360 - 8);
  });

  it("still opens below by default, with no height limit", () => {
    renderAt(100, 100);
    expect(menu().style.top).toBe(`${100 + 44 + 8}px`);
    expect(menu().style.maxHeight).toBe("");
    expect(menu().classList.contains("menu--above")).toBe(false);
  });
});
