import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { StatusContext, type StatusApi } from "../../statusBar/statusContext";
import UserMenu from "../UserMenu";

const { auth } = vi.hoisted(() => ({
  auth: {
    user: { email: "admin@example.com", role: "admin", favorites: [] },
    logout: vi.fn<() => Promise<void>>(),
  },
}));

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => auth }));

const status: StatusApi = { show: vi.fn(), clear: vi.fn() };

let container: HTMLDivElement;
let root: Root;

const logoutItem = () =>
  [...document.querySelectorAll<HTMLButtonElement>(".user-menu__item.danger")][0];

function renderAndOpen() {
  act(() => root.render(
    <StatusContext.Provider value={status}>
      <MemoryRouter initialEntries={["/users"]}>
        <Routes>
          <Route path="/users" element={<UserMenu />} />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    </StatusContext.Provider>,
  ));
  act(() => document.querySelector<HTMLButtonElement>(".user-menu__trigger")!.click());
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  auth.logout.mockReset();
  vi.mocked(status.show).mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("UserMenu logout", () => {
  it("is disabled and labelled while the request runs, and one click sends one request", async () => {
    let confirm!: () => void;
    auth.logout.mockReturnValue(new Promise<void>((resolve) => { confirm = resolve; }));
    renderAndOpen();

    act(() => { logoutItem().click(); logoutItem().click(); });
    await act(async () => {});

    expect(auth.logout).toHaveBeenCalledOnce();
    expect(logoutItem().disabled).toBe(true);
    expect(logoutItem().getAttribute("aria-busy")).toBe("true");
    expect(logoutItem().textContent).toBe("Logging out...");

    await act(async () => { confirm(); });
    expect(document.body.textContent).toContain("Login page");
  });

  it("stays on the page and shows the error when the request fails", async () => {
    auth.logout.mockRejectedValue(new Error("down"));
    renderAndOpen();

    await act(async () => { logoutItem().click(); });

    expect(document.body.textContent).not.toContain("Login page");
    expect(status.show).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "error", actionLabel: "Retry" }),
    );
  });
});
