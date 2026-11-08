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
import { toggleFavorite as apiToggleFavorite } from "../../api/documentsClient";

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

  it("keeps the user signed in and their data when the logout request fails", async () => {
    logoutMock.mockRejectedValue(new Error("network down"));
    seedSessionData();

    await act(async () => {
      await expect(auth.logout()).rejects.toThrow("network down");
    });

    expect(auth.user?.email).toBe(alice.email);
    expect(auth.signedOut).toBeFalsy();
    expect(JSON.parse(localStorage.getItem(AUTH_USER_KEY) ?? "null")?.email).toBe(alice.email);
    expect(localStorage.getItem(CHAT_KEY)).not.toBeNull();
    expect(queryClient.getQueryData(DOCUMENTS_QUERY_KEY)).toEqual([{ id: "doc-1", title: "Alice's notes" }]);
  });

  it("keeps the user signed in until the server confirms the logout", async () => {
    let confirm!: (value: { ok: true }) => void;
    logoutMock.mockReturnValue(new Promise((resolve) => { confirm = resolve; }));

    let signOut!: Promise<void>;
    act(() => { signOut = auth.logout(); });
    expect(auth.user?.email).toBe(alice.email);

    await act(async () => {
      confirm({ ok: true });
      await signOut;
    });
    expect(auth.user).toBeNull();
    expect(auth.signedOut).toBe(true);
  });

  it("sends one logout request when asked twice, and both callers get its result", async () => {
    let fail!: (reason: Error) => void;
    logoutMock.mockReturnValue(new Promise((_, reject) => { fail = reject; }));

    const results: Promise<void>[] = [];
    act(() => { results.push(auth.logout(), auth.logout()); });
    expect(logoutMock).toHaveBeenCalledOnce();

    await act(async () => {
      fail(new Error("down"));
      await Promise.allSettled(results);
    });
    await expect(results[0]).rejects.toThrow("down");
    await expect(results[1]).rejects.toThrow("down");
  });

  it("can log out again after a failed attempt", async () => {
    logoutMock.mockRejectedValueOnce(new Error("down"));
    await act(async () => {
      await auth.logout().catch(() => {});
    });
    expect(auth.user?.email).toBe(alice.email);

    await act(async () => {
      await auth.logout();
    });
    expect(logoutMock).toHaveBeenCalledTimes(2);
    expect(auth.user).toBeNull();
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

  it("does not call a 401 that arrives during logout an expired session", async () => {
    let confirm!: (value: { ok: true }) => void;
    logoutMock.mockReturnValue(new Promise((resolve) => { confirm = resolve; }));
    let signOut!: Promise<void>;
    act(() => { signOut = auth.logout(); });

    await requestWithExpiredSession();
    expect(auth.sessionExpired).toBe(false);

    await act(async () => {
      confirm({ ok: true });
      await signOut;
    });
    expect(auth.user).toBeNull();
    expect(auth.sessionExpired).toBe(false);
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

describe("AuthProvider favorites", () => {
  type FavoritesResponse = { favorites: string[] };

  function pendingToggle() {
    let finish!: (value: FavoritesResponse) => void;
    let fail!: (reason: Error) => void;
    vi.mocked(apiToggleFavorite).mockReturnValueOnce(
      new Promise<FavoritesResponse>((resolve, reject) => { finish = resolve; fail = reject; }),
    );
    return { finish: (v: FavoritesResponse) => finish(v), fail: (e: Error) => fail(e) };
  }

  beforeEach(() => vi.mocked(apiToggleFavorite).mockReset());

  it("shows the change at once, blocks that document, and sends one request for a double click", async () => {
    const request = pendingToggle();
    let first!: Promise<void>;
    await act(async () => { first = auth.toggleFavorite("doc-1"); void auth.toggleFavorite("doc-1"); });

    expect(apiToggleFavorite).toHaveBeenCalledOnce();
    expect(auth.favoritesMap["doc-1"]).toBe(true);
    expect(auth.pendingFavorites).toEqual({ "doc-1": true });

    await act(async () => { request.finish({ favorites: ["doc-1"] }); await first; });

    expect(auth.favoritesMap["doc-1"]).toBe(true);
    expect(auth.pendingFavorites).toEqual({});
  });

  it("undoes the change, frees the document and rejects when the server refuses", async () => {
    const request = pendingToggle();
    let toggle!: Promise<void>;
    await act(async () => { toggle = auth.toggleFavorite("doc-1"); });

    await act(async () => {
      request.fail(new Error("down"));
      await expect(toggle).rejects.toThrow("down");
    });

    expect(auth.favoritesMap["doc-1"]).toBeUndefined();
    expect(auth.pendingFavorites).toEqual({});
    expect(JSON.parse(localStorage.getItem(AUTH_USER_KEY) ?? "null")?.favorites).toEqual([]);
  });

  it("keeps another document's change when one fails", async () => {
    const a = pendingToggle();
    const b = pendingToggle();
    let toggleA!: Promise<void>;
    let toggleB!: Promise<void>;
    await act(async () => {
      toggleA = auth.toggleFavorite("doc-a");
      toggleB = auth.toggleFavorite("doc-b");
    });

    await act(async () => { a.fail(new Error("down")); await toggleA.catch(() => {}); });
    expect(auth.favoritesMap["doc-a"]).toBeUndefined();
    expect(auth.favoritesMap["doc-b"]).toBe(true);

    await act(async () => { b.finish({ favorites: ["doc-b"] }); await toggleB; });
    expect(auth.favoritesMap["doc-b"]).toBe(true);
  });

  it("does not sign the user back in when the failure was an expired session", async () => {
    const request = pendingToggle();
    let toggle!: Promise<void>;
    await act(async () => { toggle = auth.toggleFavorite("doc-1"); });

    await requestWithExpiredSession();
    await act(async () => {
      request.fail(new ApiError("Invalid token", 401));
      await toggle.catch(() => {});
    });

    expect(auth.user).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
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

  describe("guide keys", () => {
    const GUIDE_KEYS = ["insight-desk:welcomed", "insight-desk:doc-toured", "insight-desk:new-doc-toured"];

    beforeEach(() => {
      for (const key of GUIDE_KEYS) localStorage.setItem(key, "1");
    });

    it.each([["a regular user", alice], ["a demo visitor", demoVisitor]])("stay after %s logs out", async (_label, user) => {
      await remount(async () => user);
      await act(async () => {
        await auth.logout();
      });
      for (const key of GUIDE_KEYS) expect(localStorage.getItem(key)).toBe("1");
    });

    it.each([["a regular user", alice], ["a demo visitor", demoVisitor]])("stay when %s signs in", async (_label, user) => {
      await remount(async () => { throw new ApiError("Unauthorized", 401); });
      act(() => auth.loginSuccess(user));
      for (const key of GUIDE_KEYS) expect(localStorage.getItem(key)).toBe("1");
    });
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
