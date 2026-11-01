import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { AuthContext } from "../../../../../auth/authContext";
import type { AuthContextValue } from "../../../../../auth/authTypes";
import type { DocumentItem } from "../../../../../api/documentsClient";
import { DOCUMENTS_QUERY_KEY } from "../../../../../context/DocumentsContext";
import DashboardView from "../DashboardView";

const { listDocuments } = vi.hoisted(() => ({
  listDocuments: vi.fn<() => Promise<DocumentItem[]>>(),
}));

vi.mock("../../../../../api/documentsClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../api/documentsClient")>()),
  listDocuments,
}));

const DOCS: DocumentItem[] = [
  { id: "a", title: "Handbook", category: "HR", content: "Hello", updatedAt: "2026-10-01T10:00:00Z" },
  { id: "b", title: "Notes", category: "Misc", content: "Other", updatedAt: "2026-10-02T10:00:00Z" },
];

const auth: AuthContextValue = {
  user: { email: "admin@example.com", role: "admin", favorites: [] },
  isReady: true,
  isAuthed: true,
  sessionExpired: false,
  favoritesMap: {},
  loginSuccess: () => {},
  updateUser: () => {},
  logout: async () => {},
  toggleFavorite: async () => {},
};

// The dashboard reads its AI query count from localStorage. Node's own global
// hides jsdom's here, so tests get a small in-memory one.
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// React Query publishes results on a zero-delay timeout by default; in tests it
// publishes at once, so a settled request is on screen when act returns.
notifyManager.setScheduler((callback) => callback());

async function settle(action: () => void) {
  await act(async () => action());
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function render() {
  act(() => root.render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <DashboardView canEdit canCreate />
      </AuthContext.Provider>
    </QueryClientProvider>
  ));
}

const skeleton = () => document.querySelector(".recent-docs-list[aria-busy='true']");
const loadingStatus = () => document.querySelector("[role='status']")?.textContent;
const statValues = () => [...document.querySelectorAll(".stat-value")].map((el) => el.textContent);
const recentTitles = () => [...document.querySelectorAll("button .doc-title")].map((el) => el.textContent);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", memoryStorage());
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  listDocuments.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("DashboardView loading state", () => {
  it("shows placeholders while the documents are pending, then the stats and recent list", async () => {
    const request = deferred<DocumentItem[]>();
    listDocuments.mockReturnValue(request.promise);
    render();

    expect(skeleton()).not.toBeNull();
    expect(loadingStatus()).toBe("Loading documents…");
    expect(document.querySelectorAll(".recent-doc-item")).toHaveLength(5);
    // No flash of "0" or of the empty message before the documents arrive.
    expect(statValues()).toEqual(["", "", "0", ""]);
    expect(document.querySelector(".dashboard-recent-empty")).toBeNull();

    await settle(() => request.resolve(DOCS));

    expect(skeleton()).toBeNull();
    expect(statValues()[0]).toBe("2");
    expect(recentTitles()).toEqual(["Notes", "Handbook"]);
  });

  it("drops the placeholders and shows the existing empty state when the request fails", async () => {
    const request = deferred<DocumentItem[]>();
    listDocuments.mockReturnValue(request.promise);
    render();
    expect(skeleton()).not.toBeNull();

    await settle(() => request.reject(new Error("Network error")));

    expect(skeleton()).toBeNull();
    expect(statValues()[0]).toBe("0");
    expect(document.querySelector(".dashboard-recent-empty")).not.toBeNull();
  });

  it("keeps the cached documents on screen during a background refetch", async () => {
    queryClient.setQueryData(DOCUMENTS_QUERY_KEY, DOCS);
    const refetch = deferred<DocumentItem[]>();
    listDocuments.mockReturnValue(refetch.promise);
    render();

    await settle(() => { void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY }); });

    expect(queryClient.isFetching({ queryKey: DOCUMENTS_QUERY_KEY })).toBe(1);
    expect(skeleton()).toBeNull();
    expect(statValues()[0]).toBe("2");
    expect(recentTitles()).toEqual(["Notes", "Handbook"]);

    await settle(() => refetch.resolve(DOCS.slice(0, 1)));
    expect(statValues()[0]).toBe("1");
  });
});
