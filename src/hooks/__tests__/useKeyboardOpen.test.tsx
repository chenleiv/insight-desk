import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useKeyboardOpen } from "../useKeyboardOpen";

type FakeViewport = EventTarget & { width: number; height: number; scale: number };

let viewport: FakeViewport;
let container: HTMLDivElement;
let root: Root;
let field: HTMLElement;

function Probe() {
  return <output>{useKeyboardOpen() ? "open" : "closed"}</output>;
}

const state = () => container.querySelector("output")!.textContent;

function resize(patch: Partial<Pick<FakeViewport, "width" | "height" | "scale">>) {
  act(() => {
    Object.assign(viewport, patch);
    viewport.dispatchEvent(new Event("resize"));
  });
}

function addField(tag: string, type?: string) {
  const el = document.createElement(tag);
  if (type) el.setAttribute("type", type);
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  viewport = Object.assign(new EventTarget(), { width: 390, height: 700, scale: 1 });
  vi.stubGlobal("visualViewport", viewport);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  field = addField("input", "text");
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("useKeyboardOpen", () => {
  it("is open when a field has focus and the visible height drops by a keyboard", () => {
    act(() => root.render(<Probe />));
    expect(state()).toBe("closed");
    act(() => field.focus());
    expect(state()).toBe("closed");
    resize({ height: 400 });
    expect(state()).toBe("open");
  });

  it("closes when Android's Back hides the keyboard but the field keeps focus", () => {
    act(() => root.render(<Probe />));
    act(() => field.focus());
    resize({ height: 400 });
    resize({ height: 700 });
    expect(document.activeElement).toBe(field);
    expect(state()).toBe("closed");
  });

  it("closes when the field loses focus", () => {
    act(() => root.render(<Probe />));
    act(() => field.focus());
    resize({ height: 400 });
    act(() => field.blur());
    expect(state()).toBe("closed");
  });

  it("ignores a shorter viewport with no focused field", () => {
    act(() => root.render(<Probe />));
    resize({ height: 400 });
    expect(state()).toBe("closed");
  });

  it("ignores the address bar changing the height a little", () => {
    act(() => root.render(<Probe />));
    act(() => field.focus());
    resize({ height: 620 });
    expect(state()).toBe("closed");
  });

  it("ignores controls that bring no keyboard", () => {
    act(() => root.render(<Probe />));
    act(() => addField("input", "checkbox").focus());
    resize({ height: 400 });
    expect(state()).toBe("closed");
    act(() => addField("select").focus());
    expect(state()).toBe("closed");
  });

  it("treats a textarea as a text field", () => {
    act(() => root.render(<Probe />));
    act(() => addField("textarea").focus());
    resize({ height: 400 });
    expect(state()).toBe("open");
  });

  it("stays closed while the user has pinched in", () => {
    act(() => root.render(<Probe />));
    act(() => field.focus());
    resize({ height: 300, scale: 2 });
    expect(state()).toBe("closed");
  });

  it("measures again after the screen rotates", () => {
    act(() => root.render(<Probe />));
    act(() => field.focus());
    resize({ width: 700, height: 350 });
    expect(state()).toBe("closed");
    resize({ height: 150 });
    expect(state()).toBe("open");
  });

  it("removes its listeners on unmount", () => {
    const remove = vi.spyOn(viewport, "removeEventListener");
    act(() => root.render(<Probe />));
    act(() => root.render(null));
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
  });

  it("stays closed when the browser has no visual viewport", () => {
    vi.stubGlobal("visualViewport", undefined);
    act(() => root.render(<Probe />));
    act(() => field.focus());
    expect(state()).toBe("closed");
  });
});
