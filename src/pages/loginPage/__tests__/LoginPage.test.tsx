import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../../../auth/AuthProvider";
import RequireAuth from "../../../auth/RequireAuth";
import { StatusProvider } from "../../../components/statusBar/StatusProvider";
import { apiFetch } from "../../../api/base";
import { CHAT_KEY } from "../../../storageKeys";
import { DOCUMENTS_QUERY_KEY } from "../../../context/DocumentsContext";
import type { AuthUser } from "../../../auth/authTypes";
import LoginPage from "../LoginPage";

const EXPIRED_MESSAGE = "Your session expired. Please sign in again.";

const alice: AuthUser = { email: "alice@example.com", role: "admin", favorites: [] };
const bob: AuthUser = { email: "bob@example.com", role: "viewer", favorites: [] };

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
// What the fake server answers for each path; anything else is an expired session.
let routes: Record<string, () => Response>;

const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status });

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

function Hub() {
  return <p>Hub for {queryClient.getQueryData<{ title: string }[]>(DOCUMENTS_QUERY_KEY)?.[0]?.title ?? "nobody"}</p>;
}

async function renderApp(path: string) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusProvider>
            <MemoryRouter initialEntries={[path]}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<RequireAuth />}>
                  <Route path="/hub" element={<Hub />} />
                </Route>
              </Routes>
            </MemoryRouter>
          </StatusProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
  });
}

async function signIn(email: string, password: string) {
  const form = container.querySelector("form") as HTMLFormElement;
  (form.querySelector('input[name="email"]') as HTMLInputElement).value = email;
  (form.querySelector('input[name="password"]') as HTMLInputElement).value = password;
  await act(async () => {
    form.requestSubmit();
  });
}

const text = () => container.textContent ?? "";

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", memoryStorage());
  routes = { "/api/auth/me": json(401, { detail: "Not authenticated" }) };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => (routes[url] ?? json(401, { detail: "Invalid token" }))()));
  queryClient = new QueryClient();
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

describe("LoginPage", () => {
  it("shows its own error for a failed login and no expired-session message", async () => {
    routes["/api/auth/login"] = json(401, { detail: "Invalid credentials" });
    await renderApp("/login");

    await signIn("alice@example.com", "wrong");

    expect(container.querySelector(".login-error")?.textContent).toBe("Invalid credentials");
    expect(text()).not.toContain(EXPIRED_MESSAGE);
  });

  it("shows no message when the startup identity check finds no session", async () => {
    await renderApp("/hub");

    expect(container.querySelector(".login-form")).not.toBeNull();
    expect(text()).not.toContain(EXPIRED_MESSAGE);
  });

  it("returns to login with a message on expiry, then signs in again without a refresh", async () => {
    routes["/api/auth/me"] = json(200, alice);
    await renderApp("/hub");
    queryClient.setQueryData(DOCUMENTS_QUERY_KEY, [{ id: "doc-1", title: "Alice's notes" }]);
    localStorage.setItem(CHAT_KEY, JSON.stringify([{ id: "m1", role: "user", text: "secret" }]));

    await act(async () => {
      await apiFetch("/api/documents").catch(() => {});
    });

    expect(container.querySelector('[role="status"]')?.textContent).toBe(EXPIRED_MESSAGE);
    expect(queryClient.getQueryData(DOCUMENTS_QUERY_KEY)).toBeUndefined();
    expect(localStorage.getItem(CHAT_KEY)).toBeNull();

    routes["/api/auth/login"] = json(200, { user: bob });
    await signIn("bob@example.com", "right");

    expect(text()).toContain("Hub for nobody");
    expect(text()).not.toContain("Alice's notes");
    expect(text()).not.toContain(EXPIRED_MESSAGE);
  });
});
