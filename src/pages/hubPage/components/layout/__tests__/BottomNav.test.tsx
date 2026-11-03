import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import BottomNav from "../BottomNav";
import type { ActiveView } from "../../../utils/hubView";

let container: HTMLDivElement;
let root: Root;

function render(activeView: ActiveView["kind"], showQuality = true, onSelect = vi.fn()) {
  act(() => root.render(<BottomNav activeView={activeView} showQuality={showQuality} onSelect={onSelect} />));
  return onSelect;
}

const labels = () => [...container.querySelectorAll(".bottom-nav-label")].map((el) => el.textContent);
const current = () => container.querySelectorAll("[aria-current='page']");

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

describe("BottomNav", () => {
  it("shows five tabs to users who may read the quality metrics", () => {
    render("ai");
    expect(labels()).toEqual(["Brainy", "Documents", "Dashboard", "Quality", "Settings"]);
  });

  it("hides Quality from the others", () => {
    render("ai", false);
    expect(labels()).toEqual(["Brainy", "Documents", "Dashboard", "Settings"]);
  });

  it.each([
    ["ai", "Brainy"],
    ["documents", "Documents"],
    ["doc", "Documents"],
    ["new", "Documents"],
    ["creating", "Documents"],
    ["dashboard", "Dashboard"],
    ["quality", "Quality"],
    ["settings", "Settings"],
  ] as const)("marks one active tab for the %s view", (view, label) => {
    render(view);
    expect(current()).toHaveLength(1);
    expect(current()[0].textContent).toBe(label);
    expect(current()[0].classList.contains("active")).toBe(true);
  });

  it("reports the tapped tab", () => {
    const onSelect = render("ai");
    act(() => container.querySelector<HTMLElement>(".bottom-nav-item--documents")!.click());
    expect(onSelect).toHaveBeenCalledWith("documents");
  });

  it("is a named navigation landmark", () => {
    render("ai");
    expect(container.querySelector("nav")!.getAttribute("aria-label")).toBe("Main");
  });
});
