import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../AuthProvider";
import { useAuth } from "../useAuth";
import { AUTH_USER_KEY, type AuthContextValue, type AuthUser } from "../authTypes";
import { CHAT_KEY } from "../../pages/hubPage/utils/assistantUtils";
import { DOCUMENTS_QUERY_KEY } from "../../context/DocumentsContext";

const { meMock, logoutMock } = vi.hoisted(() => ({
  meMock: vi.fn(),
  logoutMock: vi.fn(),
}));

vi.mock("../../api/authClient", () => ({
  me: meMock,
  logout: logoutMock,
}));

vi.mock("../../api/documentsClient", () => ({
  toggleFavorite: vi.fn(),
}));

const QUALITY_QUERY_KEY = ["qualitySummary", 7];

const alice: AuthUser = { email: "alice@example.com", role: "admin", favorites: [] };
const bob: AuthUser = { email: "bob@example.com", role: "viewer", favorites: [] };

let auth: AuthContextValue;
let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

// Hands the context's latest value to the test on every render.
function Probe({ expose }: { expose: (value: AuthContextValue) => void }) {
  expose(useAuth());
  return null;
}

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

// Fills the cache and storage the way a signed-in session leaves them.
function seedSessionData() {
  queryClient.setQueryData(DOCUMENTS_QUERY_KEY, [{ id: "doc-1", title: "Alice's notes" }]);
  queryClient.setQueryData(QUALITY_QUERY_KEY, { total: 3 });
  localStorage.setItem(CHAT_KEY, JSON.stringify([{ id: "m1", role: "user", text: "secret" }]));
}

function expectSessionDataCleared() {
  expect(queryClient.getQueryData(DOCUMENTS_QUERY_KEY)).toBeUndefined();
  expect(queryClient.getQueryData(QUALITY_QUERY_KEY)).toBeUndefined();
  expect(localStorage.getItem(CHAT_KEY)).toBeNull();
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", memoryStorage());
  meMock.mockReset().mockResolvedValue(alice);
  logoutMock.mockReset().mockResolvedValue({ ok: true });
  queryClient = new QueryClient();
  const expose = (value: AuthContextValue) => { auth = value; };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Probe expose={expose} />
        </AuthProvider>
      </QueryClientProvider>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AuthProvider session reset", () => {
  it("clears cached documents, quality data and chat history on logout", async () => {
    expect(auth.user?.email).toBe(alice.email);
    seedSessionData();

    await act(async () => {
      await auth.logout();
    });

    expect(logoutMock).toHaveBeenCalledOnce();
    expect(auth.user).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
    expectSessionDataCleared();
  });

  it("still clears session data when the logout request fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    logoutMock.mockRejectedValue(new Error("network down"));
    seedSessionData();

    await act(async () => {
      await auth.logout();
    });

    expect(auth.user).toBeNull();
    expectSessionDataCleared();
  });

  it("clears the previous session's data when another user signs in", async () => {
    seedSessionData();

    act(() => auth.loginSuccess(bob));

    expect(auth.user?.email).toBe(bob.email);
    expect(JSON.parse(localStorage.getItem(AUTH_USER_KEY) ?? "null")).toEqual(bob);
    expectSessionDataCleared();
  });
});
