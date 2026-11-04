import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../AuthProvider";
import { useAuth } from "../useAuth";
import type { AuthContextValue, AuthUser } from "../authTypes";
import { DOCUMENTS_QUERY_KEY, useDocuments } from "../../context/DocumentsContext";
import { useQualitySummary } from "../../pages/hubPage/hooks/useQualitySummary";
import { getUsers, login, startDemo } from "../../api/authClient";

// The real clients, providers and query cache; only the network is replaced.
const demoVisitor: AuthUser = { email: "demo-1@demo.invalid", role: "demo", favorites: [] };
const bob: AuthUser = { email: "bob@example.com", role: "admin", favorites: [] };

type Pending = { url: string; signal: AbortSignal | null | undefined; respond: (status: number, body: unknown) => void };

let pending: Pending[];
let auth: AuthContextValue;
let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

const sent = (url: string) => pending.filter((p) => p.url === url);

/** A network whose requests wait for the test to answer them, and which honors an abort. */
function fakeFetch(url: string, init: RequestInit = {}) {
  if (url === "/api/auth/me") {
    return Promise.resolve(new Response(JSON.stringify(demoVisitor), { status: 200 }));
  }
  return new Promise<Response>((resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    pending.push({
      url,
      signal: init.signal,
      respond: (status, body) => resolve(new Response(JSON.stringify(body), { status })),
    });
  });
}

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

// Reads documents and quality only while signed in, like the hub behind RequireAuth.
function SignedInQueries() {
  useDocuments();
  useQualitySummary(7);
  return null;
}

// Hands the context's latest value to the test on every render.
function Probe({ expose }: { expose: (value: AuthContextValue) => void }) {
  const value = useAuth();
  expose(value);
  return value.user ? <SignedInQueries /> : null;
}

const flush = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", memoryStorage());
  pending = [];
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
  await flush();
});

afterEach(async () => {
  // Settle whatever a test left waiting, so no request outlives it.
  for (const p of pending) p.respond(200, { ok: true });
  await flush();
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("signing out with requests in flight", () => {
  it("aborts the documents and quality requests before asking the server to log out", async () => {
    const [documents] = sent("/api/documents");
    const [quality] = sent("/api/ai/quality?days=7");
    expect(documents.signal?.aborted).toBe(false);
    expect(quality.signal?.aborted).toBe(false);

    let signOut!: Promise<void>;
    act(() => {
      signOut = auth.logout();
    });
    await flush();

    expect(sent("/api/auth/logout")).toHaveLength(1);
    expect(documents.signal?.aborted).toBe(true);
    expect(quality.signal?.aborted).toBe(true);

    sent("/api/auth/logout")[0].respond(200, { ok: true });
    await act(async () => {
      await signOut;
    });
    expect(auth.sessionExpired).toBe(false);
  });

  it("does not refill the cache or ask again after the abort", async () => {
    let signOut!: Promise<void>;
    act(() => {
      signOut = auth.logout();
    });
    await flush();
    sent("/api/auth/logout")[0].respond(200, { ok: true });
    await act(async () => {
      await signOut;
    });
    await flush();

    expect(sent("/api/documents")).toHaveLength(1);
    expect(queryClient.getQueryData(DOCUMENTS_QUERY_KEY)).toBeUndefined();
  });
});

describe("signing in while the logout is still running", () => {
  // Returns the promise in an object, or the async function would wait for it.
  async function startSignOut() {
    let signOut!: Promise<void>;
    act(() => {
      signOut = auth.logout();
    });
    await flush();
    return { signOut };
  }

  it.each([
    ["login", "/api/auth/login", () => login("bob@example.com", "bob-password-123")],
    ["the demo", "/api/auth/demo", () => startDemo()],
  ])("sends %s only after the logout answered, so its clearing cookie cannot hit the new session", async (_label, url, start) => {
    const { signOut } = await startSignOut();

    const request = start();
    await flush();
    expect(sent(url)).toHaveLength(0);

    sent("/api/auth/logout")[0].respond(200, { ok: true });
    await act(async () => {
      await signOut;
    });
    await flush();
    expect(sent(url)).toHaveLength(1);

    sent(url)[0].respond(200, { user: bob });
    await act(async () => {
      await request;
    });
  });

  it("still signs in when the logout request fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { signOut } = await startSignOut();

    const request = login("bob@example.com", "bob-password-123");
    await flush();

    sent("/api/auth/logout")[0].respond(500, { detail: "down" });
    await act(async () => {
      await signOut;
    });
    await flush();
    expect(sent("/api/auth/login")).toHaveLength(1);

    sent("/api/auth/login")[0].respond(200, { user: bob });
    await act(async () => {
      await request;
    });
  });

  it("does not wipe the new user's data when the logout finishes", async () => {
    const { signOut } = await startSignOut();

    const request = login("bob@example.com", "bob-password-123");
    await flush();
    sent("/api/auth/logout")[0].respond(200, { ok: true });
    await act(async () => {
      await signOut;
    });
    await flush();
    sent("/api/auth/login")[0].respond(200, { user: bob });
    await act(async () => {
      const { user } = await request;
      auth.loginSuccess(user);
    });
    queryClient.setQueryData(DOCUMENTS_QUERY_KEY, [{ id: "doc-1", title: "Bob's notes" }]);
    await flush();

    expect(auth.user?.email).toBe(bob.email);
    expect(queryClient.getQueryData(DOCUMENTS_QUERY_KEY)).toEqual([{ id: "doc-1", title: "Bob's notes" }]);
  });
});

describe("a response to a request from the previous session", () => {
  it("does not end the new session when it arrives as a 401 after signing in", async () => {
    // A request that is not a query, such as the users list, cannot be aborted by the cache.
    const staleRequest = getUsers().catch(() => null);
    await flush();
    const [stale] = sent("/api/users");

    let signOut!: Promise<void>;
    act(() => {
      signOut = auth.logout();
    });
    await flush();
    sent("/api/auth/logout")[0].respond(200, { ok: true });
    await act(async () => {
      await signOut;
    });
    await flush();

    const request = login("bob@example.com", "bob-password-123");
    await flush();
    sent("/api/auth/login")[0].respond(200, { user: bob });
    await act(async () => {
      const { user } = await request;
      auth.loginSuccess(user);
    });
    await flush();

    stale.respond(401, { detail: "Session ended" });
    await act(async () => {
      await staleRequest;
    });
    await flush();

    expect(auth.user?.email).toBe(bob.email);
    expect(auth.sessionExpired).toBe(false);
  });

  it("still ends the session on a 401 to a request of the current session", async () => {
    const request = getUsers().catch(() => null);
    await flush();

    sent("/api/users")[0].respond(401, { detail: "Session ended" });
    await act(async () => {
      await request;
    });
    await flush();

    expect(auth.user).toBeNull();
    expect(auth.sessionExpired).toBe(true);
  });
});
