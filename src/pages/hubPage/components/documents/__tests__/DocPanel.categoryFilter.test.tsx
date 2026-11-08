import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DocumentItem } from "../../../../../api/documentsClient";
import DocPanel from "../DocPanel";

const DOCS: DocumentItem[] = [
  { id: "1", title: "Firewall rules", category: "Security", content: "" },
  { id: "2", title: "Backup runbook", category: "Linux", content: "" },
  { id: "3", title: "Hardening guide", category: "Security, Linux", content: "" },
  { id: "4", title: "Password policy", category: "security", content: "" },
  { id: "5", title: "Onboarding", category: "HR", content: "" },
];

let container: HTMLDivElement;
let root: Root;

function render(docs: DocumentItem[], favorites: Record<string, boolean> = {}) {
  act(() => root.render(
    <DocPanel
      docs={docs}
      favorites={favorites}
      activeDocId={null}
      onOpenDocument={() => {}}
      onNew={() => {}}
      canCreate
      onToggleFavorite={() => {}}
    />
  ));
}

const select = () => container.querySelector<HTMLSelectElement>(".doc-panel-category-select")!;
const optionLabels = () => [...select().options].map((o) => o.textContent);
const titles = () => [...container.querySelectorAll(".doc-panel-row-title")].map((el) => el.textContent);
const emptyText = () => container.querySelector(".doc-panel-empty")?.textContent;

function choose(value: string) {
  act(() => {
    select().value = value;
    select().dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function typeFilter(text: string) {
  const input = container.querySelector<HTMLInputElement>(".doc-panel-search-input")!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function favoritesOnly() {
  act(() => container.querySelector<HTMLButtonElement>(".doc-panel-star-btn")!.click());
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("DocPanel category filter", () => {
  it("lists All categories first, then each category in the documents once", () => {
    render(DOCS);
    expect(optionLabels()).toEqual(["All categories", "HR", "Linux", "Security"]);
    expect(select().value).toBe("");
  });

  it("shows only the documents of the chosen category", () => {
    render(DOCS);
    choose("hr");
    expect(titles()).toEqual(["Onboarding"]);
  });

  it("merges spellings that differ only by case", () => {
    render(DOCS);
    choose("security");
    expect(titles()).toContain("Firewall rules");
    expect(titles()).toContain("Password policy");
  });

  it("returns every document with the All categories option", () => {
    render(DOCS);
    choose("hr");
    choose("");
    expect(titles()).toHaveLength(DOCS.length);
  });

  it("finds a document with a comma-separated category under each of its parts", () => {
    render(DOCS);
    choose("linux");
    expect(titles()).toEqual(["Backup runbook", "Hardening guide"]);
    choose("security");
    expect(titles()).toEqual(["Firewall rules", "Hardening guide", "Password policy"]);
  });

  it("does not offer a comma-separated list as a category of its own", () => {
    render(DOCS);
    expect(optionLabels()).not.toContain("Security, Linux");
  });

  it("splits semicolon-separated lists the same way", () => {
    render([{ id: "1", title: "Mixed", category: "Ops; Finance", content: "" }]);
    expect(optionLabels()).toEqual(["All categories", "Finance", "Ops"]);
  });

  it("combines with the text filter", () => {
    render(DOCS);
    choose("security");
    typeFilter("guide");
    expect(titles()).toEqual(["Hardening guide"]);
  });

  it("says the category has no match when the text filter empties it", () => {
    render(DOCS);
    choose("hr");
    typeFilter("firewall");
    expect(titles()).toEqual([]);
    expect(emptyText()).toBe("No documents in this category match your filter");
  });

  it("says the category has no favorites when favorites-only empties it", () => {
    render(DOCS, { "1": true });
    choose("hr");
    favoritesOnly();
    expect(titles()).toEqual([]);
    expect(emptyText()).toBe("No favorites in this category");
  });

  it("stops filtering when the chosen category no longer exists", () => {
    render(DOCS);
    choose("hr");
    const remaining = DOCS.filter((d) => d.category !== "HR");
    render(remaining);
    expect(select().value).toBe("");
    expect(titles()).toHaveLength(remaining.length);
  });

  it("is disabled while there are no categories", () => {
    render([]);
    expect(select().disabled).toBe(true);
    expect(optionLabels()).toEqual(["All categories"]);
    expect(emptyText()).toBe("No documents yet");
  });
});
