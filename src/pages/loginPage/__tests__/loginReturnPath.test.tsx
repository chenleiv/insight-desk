import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider, Route, createRoutesFromElements, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../../../auth/AuthProvider";
import { useAuth } from "../../../auth/useAuth";
import RequireAuth from "../../../auth/RequireAuth";
import { StatusProvider } from "../../../components/statusBar/StatusProvider";
import type { AuthUser } from "../../../auth/authTypes";
import LoginPage from "../LoginPage";

const alice: AuthUser = { email: "alice@example.com", role: "admin", favorites: [] };

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
let routes: Record<string, () => Response>;
let router: ReturnType<typeof createMemoryRouter>;

const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status });

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

function Page() {
  const { logout } = useAuth();
  const { pathname, search } = useLocation();
  return (
    <div>
      <output>{pathname}{search}</output>
      <button type="button" className="sign-out" onClick={() => void logout()}>Sign out</button>
    </div>
  );
}

type Entry = string | { pathname: string; state: unknown };

async function renderApp(entry: Entry) {
  router = createMemoryRouter(createRoutesFromElements(
    <>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="*" element={<Page />} />
      </Route>
    </>
  ), { initialEntries: [entry] });
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusProvider>
            <RouterProvider router={router} />
          </StatusProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
  });
}

async function signIn() {
  const form = container.querySelector("form") as HTMLFormElement;
  (form.querySelector('input[name="email"]') as HTMLInputElement).value = alice.email;
  (form.querySelector('input[name="password"]') as HTMLInputElement).value = "right";
  await act(async () => { form.requestSubmit(); });
}

const page = () => container.querySelector("output")?.textContent;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", memoryStorage());
  routes = {
    "/api/auth/me": json(401, { detail: "Not authenticated" }),
    "/api/auth/login": json(200, { user: alice }),
    "/api/auth/logout": json(200, { ok: true }),
  };
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

describe("returning after sign-in", () => {
  it("opens a direct link to a document that asked a signed-out visitor to sign in", async () => {
    await renderApp("/hub?doc=abc123");
    expect(container.querySelector(".login-form")).not.toBeNull();
    await signIn();
    expect(page()).toBe("/hub?doc=abc123");
  });

  it.each([
    ["a full URL", "https://example.com/phish"],
    ["a protocol-relative URL", "//example.com/phish"],
    ["a backslash trick", "/\\example.com/phish"],
  ])("goes to the default page instead of %s", async (_label, pathname) => {
    await renderApp({ pathname: "/login", state: { from: { pathname, search: "", hash: "" } } });
    await signIn();
    expect(page()).toBe("/hub");
    expect(router.state.location.pathname).toBe("/hub");
  });

  it("goes to the default page after a sign-out, not back to the page that was open", async () => {
    routes["/api/auth/me"] = json(200, alice);
    await renderApp("/hub?view=settings");
    expect(page()).toBe("/hub?view=settings");

    routes["/api/auth/me"] = json(401, { detail: "Not authenticated" });
    await act(async () => { container.querySelector<HTMLElement>(".sign-out")!.click(); });
    expect(container.querySelector(".login-form")).not.toBeNull();

    await signIn();
    expect(page()).toBe("/hub");
  });
});
