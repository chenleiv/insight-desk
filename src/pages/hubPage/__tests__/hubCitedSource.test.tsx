import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusContext, type StatusApi } from "../../../components/statusBar/statusContext";
import { ConfirmContext, type ConfirmFn } from "../../../components/confirmModal/confirmContext";
import { CHAT_KEY } from "../../../storageKeys";
import HubPage from "../HubPage";

// Stable values, as the real query hook returns: a new array per render would never settle.
const { auth, documents, setDocs } = vi.hoisted(() => ({
  auth: {
    user: { email: "admin@example.com", role: "admin" },
    logout: () => {},
    toggleFavorite: () => {},
    favoritesMap: {},
  },
  documents: { docs: [{ id: "d1", title: "Vacation Policy" }], loading: false, error: null },
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
vi.mock("../../../api/aiClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../api/aiClient")>()),
  getSuggestions: () => Promise.resolve({ questions: [] }),
}));
vi.mock("../components/documents/DocumentPane", () => ({
  default: () => <div className="document-pane-stub" />,
}));

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

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", memoryStorage());
  localStorage.setItem("insight-desk:welcomed", "1");
  // jsdom has no layout, so it does not implement this.
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("a source chip in the chat", () => {
  it("opens the document through the URL, and Back returns to the chat", async () => {
    localStorage.setItem(CHAT_KEY, JSON.stringify([
      { id: "u1", role: "user", text: "Question" },
      {
        id: "a1",
        role: "assistant",
        text: "Twenty days.",
        sources: [{ id: "d1", title: "Vacation Policy" }],
        citationStyle: "numbered",
        isTyped: true,
      },
    ]));
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

    await act(async () => container.querySelector<HTMLButtonElement>(".ai-message-sources button")!.click());
    expect(router.state.location.search).toBe("?doc=d1");
    expect(container.querySelector(".document-pane-stub")).not.toBeNull();

    await act(async () => { await router.navigate(-1); });
    expect(router.state.location.search).toBe("");
    expect(container.querySelector(".ai-message-sources button")).not.toBeNull();
  });
});
