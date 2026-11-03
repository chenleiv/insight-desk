import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusContext, type StatusApi } from "../../../../../components/statusBar/statusContext";
import { ConfirmContext, type ConfirmFn } from "../../../../../components/confirmModal/confirmContext";
import type { DocumentItem } from "../../../../../api/documentsClient";
import DocumentPane from "../DocumentPane";

vi.mock("../../../../../hooks/useMobile", () => ({ useMobile: () => true }));

const DOC: DocumentItem = { id: "a", title: "Handbook", category: "HR", content: "Hello" };
const status: StatusApi = { show: vi.fn(), clear: vi.fn() };
const confirm = vi.fn<ConfirmFn>();

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

let container: HTMLDivElement;
let root: Root;

function renderPane(isCreating: boolean) {
  act(() => root.render(
    <QueryClientProvider client={new QueryClient()}>
      <StatusContext.Provider value={status}>
        <ConfirmContext.Provider value={confirm}>
          <DocumentPane
            doc={isCreating ? null : DOC}
            canEdit
            isCreating={isCreating}
            onCancelCreate={() => {}}
            onCreated={() => {}}
            onSaved={() => {}}
            hasDocs
            onClose={() => {}}
          />
        </ConfirmContext.Provider>
      </StatusContext.Provider>
    </QueryClientProvider>
  ));
}

const q = (selector: string) => document.querySelector<HTMLElement>(selector);
const stored = () => [localStorage.getItem("insight-desk:doc-toured"), localStorage.getItem("insight-desk:new-doc-toured")];

function click(selector: string) {
  act(() => { q(selector)!.click(); });
}

// Without a target the bubble would show centered on a dimmed backdrop instead of a spotlight.
function expectSpotlightOnEachStep(titles: string[]) {
  for (const title of titles) {
    expect(q(".tour-callout-title")!.textContent).toContain(title);
    expect(q(".tour-spotlight")).not.toBeNull();
    click(".tour-btn--primary");
  }
  expect(q(".tour-callout")).toBeNull();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", memoryStorage());
  // jsdom has no layout, so it leaves this out.
  Element.prototype.scrollTo ??= () => {};
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("document tours on a phone", () => {
  it("finds every target of the document tour in the phone header", () => {
    renderPane(false);
    expect(q(".tour-callout-desc")!.textContent).toContain("⋮");
    expectSpotlightOnEachStep(["Edit", "Attachments"]);
    expect(stored()).toEqual(["1", null]);
  });

  it("finds every target of the new document tour", () => {
    renderPane(true);
    expectSpotlightOnEachStep(["Start writing", "Import text", "Add file"]);
    expect(stored()).toEqual([null, "1"]);
  });

  it("takes focus from the auto-focused title, so the keyboard does not cover the bubble", () => {
    renderPane(true);
    expect(document.activeElement).not.toBe(q(".notion-title-input"));
  });

  it("leaves the guides alone after a tap outside the bubble", () => {
    renderPane(false);
    click(".tour-backdrop");
    expect(q(".tour-callout")).not.toBeNull();
    expect(stored()).toEqual([null, null]);
  });

  it("skips the other tour from the Skip button", () => {
    renderPane(false);
    click(".tour-skip");
    expect(q(".tour-callout")).toBeNull();
    expect(stored()).toEqual(["1", "1"]);
  });
});
