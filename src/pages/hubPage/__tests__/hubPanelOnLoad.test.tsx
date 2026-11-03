import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusContext, type StatusApi } from "../../../components/statusBar/statusContext";
import { ConfirmContext, type ConfirmFn } from "../../../components/confirmModal/confirmContext";
import HubPage from "../HubPage";

// Stable values, as the real query hook returns: a new array per render would never settle.
const { auth, isMobile, documents, setDocs } = vi.hoisted(() => ({
  auth: {
    user: { email: "admin@example.com", role: "admin" } as { email: string; role: string },
    logout: () => {},
    toggleFavorite: () => {},
    favoritesMap: {},
  },
  isMobile: { value: false },
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
vi.mock("../../../hooks/useMobile", () => ({ useMobile: () => isMobile.value }));
vi.mock("../components/views/AIAssistantView", () => ({ default: () => null }));

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

const panel = () => document.querySelector<HTMLElement>(".doc-panel-wrapper");

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", memoryStorage());
  localStorage.setItem("insight-desk:welcomed", "1");
  auth.user = { email: "admin@example.com", role: "admin" };
  isMobile.value = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("documents panel on page load", () => {
  it("is open even when it was collapsed before", () => {
    localStorage.setItem("docPanelCollapsed", "true");
    localStorage.setItem("docPanelWidth", "360");
    renderHub();
    expect(panel()!.classList.contains("collapsed")).toBe(false);
    expect(panel()!.style.width).toBe("360px");
  });

  it("opens at the default width when the saved width is too narrow", () => {
    localStorage.setItem("docPanelWidth", "140");
    renderHub();
    expect(panel()!.classList.contains("collapsed")).toBe(false);
    expect(panel()!.style.width).toBe("320px");
  });

  it("is not shown on mobile, where the documents are in their own view", () => {
    isMobile.value = true;
    renderHub();
    expect(panel()).toBeNull();
  });
});

describe("demo banner", () => {
  it("states the demo's real rules and limits", () => {
    auth.user = { email: "demo-1@demo.invalid", role: "demo" };
    renderHub();
    expect(document.querySelector(".demo-banner")!.textContent).toBe(
      "Demo workspace: your own private copy of the sample documents, deleted when you sign out. "
      + "Edit, add and chat freely. "
      + "Limits: 20 documents, 20,000 characters and 1 attachment per document. Import and admin settings are disabled.",
    );
  });
});
