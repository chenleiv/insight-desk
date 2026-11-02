import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { finishTour, markGuideDone, resetGuides, skipAllGuides, useGuideDone, type GuideId } from "../guides";

const KEYS = ["insight-desk:welcomed", "insight-desk:doc-toured", "insight-desk:new-doc-toured"];

// Node's own localStorage global hides jsdom's here, so tests get a small in-memory one.
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    key: (i) => [...items.keys()][i] ?? null,
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => { items.set(k, String(v)); },
    removeItem: (k) => { items.delete(k); },
    clear: () => items.clear(),
  };
}

function Probe({ id }: { id: GuideId }) {
  return <span data-guide={id}>{useGuideDone(id) ? "done" : "open"}</span>;
}

const shown = (id: GuideId) => document.querySelector(`[data-guide="${id}"]`)!.textContent;
const stored = () => KEYS.map((k) => localStorage.getItem(k));

let container: HTMLDivElement;
let root: Root;

function renderProbes() {
  act(() => root.render(
    <>
      <Probe id="welcome" />
      <Probe id="doc" />
      <Probe id="newDoc" />
    </>
  ));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", memoryStorage());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
    resetGuides();
  });
  container.remove();
  vi.unstubAllGlobals();
});

describe("guides", () => {
  it("starts with every guide open", () => {
    renderProbes();
    expect([shown("welcome"), shown("doc"), shown("newDoc")]).toEqual(["open", "open", "open"]);
  });

  it("reads keys written by an earlier version", () => {
    localStorage.setItem("insight-desk:doc-toured", "1");
    renderProbes();
    expect([shown("welcome"), shown("doc"), shown("newDoc")]).toEqual(["open", "done", "open"]);
  });

  it("marks only the finished guide", () => {
    renderProbes();
    act(() => markGuideDone("welcome"));
    expect(stored()).toEqual(["1", null, null]);
    expect([shown("welcome"), shown("doc"), shown("newDoc")]).toEqual(["done", "open", "open"]);
  });

  it("marks every guide when one is skipped, updating what is already on screen", () => {
    renderProbes();
    act(() => skipAllGuides());
    expect(stored()).toEqual(["1", "1", "1"]);
    expect([shown("welcome"), shown("doc"), shown("newDoc")]).toEqual(["done", "done", "done"]);
  });

  it("marks one guide for a completed tour and all of them for a skipped tour", () => {
    finishTour("doc", "completed");
    expect(stored()).toEqual([null, "1", null]);
    finishTour("doc", "skipped");
    expect(stored()).toEqual(["1", "1", "1"]);
  });

  it("makes every guide appear again after a reset, leaving other keys alone", () => {
    localStorage.setItem("theme", "dark");
    skipAllGuides();
    renderProbes();
    act(() => resetGuides());
    expect(stored()).toEqual([null, null, null]);
    expect(localStorage.getItem("theme")).toBe("dark");
    expect([shown("welcome"), shown("doc"), shown("newDoc")]).toEqual(["open", "open", "open"]);
  });

  it("picks up a change from another tab", () => {
    renderProbes();
    localStorage.setItem("insight-desk:doc-toured", "1");
    act(() => { window.dispatchEvent(new Event("storage")); });
    expect(shown("doc")).toBe("done");
  });

  it("still closes guides when storage refuses writes, until they are reset", () => {
    const refusing = memoryStorage();
    refusing.setItem = () => { throw new Error("blocked"); };
    vi.stubGlobal("localStorage", refusing);
    renderProbes();

    act(() => skipAllGuides());
    expect([shown("welcome"), shown("doc"), shown("newDoc")]).toEqual(["done", "done", "done"]);

    act(() => resetGuides());
    expect([shown("welcome"), shown("doc"), shown("newDoc")]).toEqual(["open", "open", "open"]);
  });

  it("treats unreadable storage as not done instead of throwing", () => {
    const refusing = memoryStorage();
    refusing.getItem = () => { throw new Error("blocked"); };
    vi.stubGlobal("localStorage", refusing);
    renderProbes();
    expect(shown("doc")).toBe("open");
  });
});
