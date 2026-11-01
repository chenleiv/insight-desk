import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../AuthProvider";
import { useAuth } from "../useAuth";
import { AUTH_USER_KEY, type AuthContextValue, type AuthUser } from "../authTypes";
import { CHAT_KEY } from "../../storageKeys";
import { DOCUMENTS_QUERY_KEY } from "../../context/DocumentsContext";
import { apiFetch, ApiError } from "../../api/base";
import { scopedKey } from "../../utils/storage";
import { SESSION_CHECK_MIN_GAP_MS } from "../useSessionCheck";

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
const demoVisitor: AuthUser = { email: "demo-1234@demo.invalid", role: "demo", favorites: [] };

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

// A request whose session the server no longer accepts.
async function requestWithExpiredSession() {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "Invalid token" }), { status: 401 })));
  await act(async () => {
    await apiFetch("/api/documents").catch(() => {});
  });
}

describe("AuthProvider session expiry", () => {
  it("signs the user out and clears session data on a 401 mid-session", async () => {
    seedSessionData();

    await requestWithExpiredSession();

    expect(auth.user).toBeNull();
    expect(auth.isAuthed).toBe(false);
    expect(auth.sessionExpired).toBe(true);
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
    expectSessionDataCleared();
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it("handles several parallel 401 responses once", async () => {
    const clearSpy = vi.spyOn(queryClient, "clear");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));

    await act(async () => {
      await Promise.allSettled([
        apiFetch("/api/documents"),
        apiFetch("/api/ai/suggestions"),
        apiFetch("/api/ai/quality?days=7"),
      ]);
    });

    expect(clearSpy).toHaveBeenCalledOnce();
    expect(auth.sessionExpired).toBe(true);
  });

  it("ignores a late 401 that arrives after logout", async () => {
    await act(async () => {
      await auth.logout();
    });

    await requestWithExpiredSession();

    expect(auth.user).toBeNull();
    expect(auth.sessionExpired).toBe(false);
  });

  it("keeps a 401 from the startup identity check silent", async () => {
    act(() => root.unmount());
    meMock.mockReset().mockRejectedValue(new ApiError("Not authenticated", 401));
    root = createRoot(container);
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Probe expose={(value) => { auth = value; }} />
          </AuthProvider>
        </QueryClientProvider>,
      );
    });

    expect(auth.isReady).toBe(true);
    expect(auth.user).toBeNull();
    expect(auth.sessionExpired).toBe(false);
  });

  it("lets a different user sign in after expiry without the previous user's data", async () => {
    seedSessionData();
    await requestWithExpiredSession();

    act(() => auth.loginSuccess(bob));

    expect(auth.user?.email).toBe(bob.email);
    expect(auth.sessionExpired).toBe(false);
    expectSessionDataCleared();

    // The new session is guarded again: its own expiry is handled.
    await requestWithExpiredSession();
    expect(auth.user).toBeNull();
    expect(auth.sessionExpired).toBe(true);
  });
});

// Renders a fresh provider whose startup identity check answers with the given result.
async function remount(startup: () => Promise<AuthUser>) {
  act(() => root.unmount());
  meMock.mockReset().mockImplementation(startup);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Probe expose={(value) => { auth = value; }} />
        </AuthProvider>
      </QueryClientProvider>,
    );
  });
}

describe("AuthProvider storage cleanup", () => {
  const DEVICE_KEYS = ["theme", "docPanelCollapsed", "docPanelWidth", "insight-desk:welcomed"];

  function seedScopedKeys(email: string) {
    localStorage.setItem(scopedKey("documentsOrder", email), JSON.stringify(["doc-1"]));
    localStorage.setItem(scopedKey("aiQueryCount", email), "3");
  }

  function scopedKeysOf(email: string) {
    return [scopedKey("documentsOrder", email), scopedKey("aiQueryCount", email)].map((k) => localStorage.getItem(k));
  }

  beforeEach(() => {
    for (const key of DEVICE_KEYS) localStorage.setItem(key, "1");
  });

  it("removes a demo visitor's scoped keys on logout and keeps device preferences", async () => {
    await remount(async () => demoVisitor);
    seedScopedKeys(demoVisitor.email);

    await act(async () => {
      await auth.logout();
    });

    expect(scopedKeysOf(demoVisitor.email)).toEqual([null, null]);
    for (const key of DEVICE_KEYS) expect(localStorage.getItem(key)).toBe("1");
  });

  it("removes a demo visitor's scoped keys when the session expires", async () => {
    await remount(async () => demoVisitor);
    seedScopedKeys(demoVisitor.email);

    await requestWithExpiredSession();

    expect(scopedKeysOf(demoVisitor.email)).toEqual([null, null]);
  });

  it("removes keys left by earlier demo visitors when a new one signs in", async () => {
    seedScopedKeys("demo-old@demo.invalid");

    act(() => auth.loginSuccess(demoVisitor));

    expect(scopedKeysOf("demo-old@demo.invalid")).toEqual([null, null]);
  });

  it("keeps a regular user's scoped keys on logout", async () => {
    seedScopedKeys(alice.email);

    await act(async () => {
      await auth.logout();
    });

    expect(scopedKeysOf(alice.email)).toEqual([JSON.stringify(["doc-1"]), "3"]);
  });

  it("clears the chat history when the app starts with an expired session", async () => {
    seedSessionData();
    seedScopedKeys(demoVisitor.email);

    await remount(async () => {
      throw new ApiError("Invalid token", 401);
    });

    expect(auth.user).toBeNull();
    expect(localStorage.getItem(CHAT_KEY)).toBeNull();
    expect(scopedKeysOf(demoVisitor.email)).toEqual([null, null]);
  });
});

describe("AuthProvider proactive session check", () => {
  function focusLater() {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + SESSION_CHECK_MIN_GAP_MS);
    window.dispatchEvent(new Event("focus"));
  }

  beforeEach(() => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  });

  it("expires the session with the sign-in notice when a focus check gets a 401", async () => {
    seedSessionData();
    meMock.mockRejectedValue(new ApiError("Invalid token", 401));

    await act(async () => {
      focusLater();
    });

    expect(auth.user).toBeNull();
    expect(auth.sessionExpired).toBe(true);
    expectSessionDataCleared();
  });

  it("sends no check while signed out", async () => {
    await act(async () => {
      await auth.logout();
    });
    meMock.mockClear();

    await act(async () => {
      focusLater();
    });

    expect(meMock).not.toHaveBeenCalled();
  });
});
