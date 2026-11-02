import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusContext, type StatusApi } from "../../../components/statusBar/statusContext";
import { ConfirmContext, type ConfirmFn } from "../../../components/confirmModal/confirmContext";
import HubPage from "../HubPage";
import { resetGuides } from "../utils/guides";

// Stable values, as the real query hook returns: a new array per render would never settle.
const { auth, documents, setDocs } = vi.hoisted(() => ({
  auth: {
    user: { email: "admin@example.com", role: "admin" },
    logout: () => {},
    toggleFavorite: () => {},
    favoritesMap: {},
  },
  documents: { docs: [], loading: false, error: null },
  setDocs: () => {},
}));

vi.mock("../../../auth/useAuth", () => ({
  useAuth: () => auth,
}));
vi.mock("../../../context/DocumentsContext", () => ({
  DOCUMENTS_QUERY_KEY: ["documents"],
  useDocuments: () => documents,
  useSetDocs: () => setDocs,
}));
vi.mock("../../../hooks/useMobile", () => ({ useMobile: () => false }));
vi.mock("../components/views/AIAssistantView", () => ({ default: () => null }));

const status: StatusApi = { show: vi.fn(), clear: vi.fn() };
const confirm = vi.fn<ConfirmFn>();

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

let container: HTMLDivElement;
let root: Root;

function renderHub() {
  const router = createMemoryRouter([{ path: "*", element: <HubPage /> }], { initialEntries: ["/hub"] });
  act(() => root.render(
    <QueryClientProvider client={new QueryClient()}>
      <StatusContext.Provider value={status}>
        <ConfirmContext.Provider value={confirm}>
          <RouterProvider router={router} />
        </ConfirmContext.Provider>
      </StatusContext.Provider>
    </QueryClientProvider>
  ));
}

const modal = () => document.querySelector(".welcome-modal");
const tour = () => document.querySelector(".tour-callout");
const stored = () => KEYS.map((k) => localStorage.getItem(k));

function click(selector: string) {
  act(() => document.querySelector<HTMLElement>(selector)!.click());
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", memoryStorage());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("hub guides", () => {
  it("shows the welcome on the first visit", () => {
    renderHub();
    expect(modal()).not.toBeNull();
  });

  it.each([
    ["I'll explore on my own", ".welcome-skip"],
    ["the close button", ".welcome-close"],
    ["a click outside", ".welcome-overlay"],
  ])("skipping the welcome with %s marks every guide and is remembered", (_label, selector) => {
    renderHub();
    click(selector);
    expect(modal()).toBeNull();
    expect(stored()).toEqual(["1", "1", "1"]);

    act(() => root.unmount());
    root = createRoot(container);
    renderHub();
    expect(modal()).toBeNull();
  });

  it("starting the tour marks only the welcome", () => {
    renderHub();
    click(".welcome-cta");
    expect(modal()).toBeNull();
    expect(tour()).not.toBeNull();
    expect(stored()).toEqual(["1", null, null]);
  });

  it("skipping the hub tour marks every guide", () => {
    renderHub();
    click(".welcome-cta");
    click(".tour-skip");
    expect(tour()).toBeNull();
    expect(stored()).toEqual(["1", "1", "1"]);
  });

  it("finishing the hub tour leaves the document tours for later", () => {
    renderHub();
    click(".welcome-cta");
    click(".tour-btn--primary");
    click(".tour-btn--primary");
    click(".tour-btn--primary");
    expect(tour()).toBeNull();
    expect(stored()).toEqual(["1", null, null]);
  });

  it("brings the welcome back at once after a reset", () => {
    renderHub();
    click(".welcome-skip");
    act(() => resetGuides());
    expect(modal()).not.toBeNull();
    expect(stored()).toEqual([null, null, null]);
  });
});
