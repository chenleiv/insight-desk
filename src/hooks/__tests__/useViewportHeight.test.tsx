import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useViewportHeight } from "../useViewportHeight";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  useViewportHeight();
  return null;
}

class FakeViewport extends EventTarget {
  height = 640;
  offsetTop = 0;
  scale = 1;
}

const prop = (name: string) => document.documentElement.style.getPropertyValue(name);

let root: Root;
let viewport: FakeViewport;

beforeEach(() => {
  viewport = new FakeViewport();
  vi.stubGlobal("visualViewport", viewport);
  root = createRoot(document.createElement("div"));
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("useViewportHeight", () => {
  it("publishes the visible height and offset on mount", () => {
    act(() => root.render(<Probe />));
    expect(prop("--app-height")).toBe("640px");
    expect(prop("--app-top")).toBe("0px");
  });

  it("follows the keyboard opening and the page being moved", () => {
    act(() => root.render(<Probe />));
    viewport.height = 300;
    viewport.dispatchEvent(new Event("resize"));
    expect(prop("--app-height")).toBe("300px");
    viewport.offsetTop = 120;
    viewport.dispatchEvent(new Event("scroll"));
    expect(prop("--app-top")).toBe("120px");
  });

  it("leaves the layout alone while the user has pinched in", () => {
    act(() => root.render(<Probe />));
    viewport.scale = 2;
    viewport.height = 320;
    viewport.dispatchEvent(new Event("resize"));
    expect(prop("--app-height")).toBe("640px");
  });

  it("removes the values and listeners on unmount", () => {
    act(() => root.render(<Probe />));
    act(() => root.render(null));
    expect(prop("--app-height")).toBe("");
    viewport.height = 100;
    viewport.dispatchEvent(new Event("resize"));
    expect(prop("--app-height")).toBe("");
  });

  it("falls back to the stylesheet when the browser has no visual viewport", () => {
    vi.stubGlobal("visualViewport", undefined);
    act(() => root.render(<Probe />));
    expect(prop("--app-height")).toBe("");
  });
});
