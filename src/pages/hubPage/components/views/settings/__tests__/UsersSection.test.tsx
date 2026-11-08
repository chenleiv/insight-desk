import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AuthContext } from "../../../../../../auth/authContext";
import type { AuthContextValue } from "../../../../../../auth/authTypes";
import { StatusContext, type StatusApi } from "../../../../../../components/statusBar/statusContext";
import { ConfirmContext, type ConfirmFn } from "../../../../../../components/confirmModal/confirmContext";
import type { UserRecord } from "../../../../../../api/authClient";
import { UsersSection } from "../UsersSection";

const { getUsers, deleteUser } = vi.hoisted(() => ({
  getUsers: vi.fn<() => Promise<UserRecord[]>>(),
  deleteUser: vi.fn<(id: number) => Promise<{ ok: true }>>(),
}));

vi.mock("../../../../../../api/authClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../../api/authClient")>()),
  getUsers,
  deleteUser,
}));

const USERS: UserRecord[] = [
  { id: 1, email: "admin@example.com", role: "admin", status: "active", displayName: "Admin" },
  { id: 2, email: "viewer@example.com", role: "viewer", status: "inactive" },
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

const status: StatusApi = { show: vi.fn(), clear: vi.fn() };
const confirm = vi.fn<ConfirmFn>();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let container: HTMLDivElement;
let root: Root;

function render() {
  act(() => root.render(
    <AuthContext.Provider value={auth}>
      <StatusContext.Provider value={status}>
        <ConfirmContext.Provider value={confirm}>
          <UsersSection />
        </ConfirmContext.Provider>
      </StatusContext.Provider>
    </AuthContext.Provider>
  ));
}

const skeleton = () => document.querySelector(".settings-users-table[aria-busy='true']");
const loadingStatus = () => document.querySelector("[role='status']")?.textContent;
const userCount = () => document.querySelector(".settings-user-count")?.textContent;
const emails = () => [...document.querySelectorAll(".settings-user-email")].map((el) => el.textContent);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  getUsers.mockReset();
  vi.mocked(status.show).mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("UsersSection delete user", () => {
  const deleteBtns = () => [...document.querySelectorAll<HTMLButtonElement>(".settings-delete-btn")];
  const viewerRow = () => document.querySelectorAll(".settings-user-row")[1];

  async function renderLoaded() {
    getUsers.mockResolvedValue(USERS);
    await act(async () => render());
  }

  beforeEach(() => {
    deleteUser.mockReset();
    confirm.mockReset();
  });

  it("marks the row as deleting, blocks it, and removes it when the server confirms", async () => {
    const request = deferred<{ ok: true }>();
    deleteUser.mockReturnValue(request.promise);
    confirm.mockResolvedValue(true);
    await renderLoaded();

    await act(async () => deleteBtns()[1].click());

    expect(viewerRow().textContent).toContain("Deleting…");
    expect(deleteBtns()[1].disabled).toBe(true);
    expect(deleteBtns()[1].getAttribute("aria-busy")).toBe("true");
    expect(deleteBtns()[1].getAttribute("aria-label")).toBe("Deleting user…");
    expect(viewerRow().querySelector<HTMLSelectElement>("select")!.disabled).toBe(true);

    await act(async () => request.resolve({ ok: true }));

    expect(emails()).toEqual(["admin@example.com"]);
  });

  it("opens one dialog and sends one request for a double click", async () => {
    deleteUser.mockResolvedValue({ ok: true });
    let answer!: (ok: boolean) => void;
    confirm.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    await renderLoaded();

    const btn = deleteBtns()[1];
    await act(async () => { btn.click(); btn.click(); });
    expect(confirm).toHaveBeenCalledOnce();

    await act(async () => answer(true));
    expect(deleteUser).toHaveBeenCalledOnce();
  });

  it("restores the row and shows the error when the delete fails", async () => {
    deleteUser.mockRejectedValue(new Error("Server down"));
    confirm.mockResolvedValue(true);
    await renderLoaded();

    await act(async () => deleteBtns()[1].click());

    expect(emails()).toEqual(["admin@example.com", "viewer@example.com"]);
    expect(viewerRow().textContent).not.toContain("Deleting…");
    expect(deleteBtns()[1].disabled).toBe(false);
    expect(status.show).toHaveBeenCalledWith({ kind: "error", title: "Error", message: "Server down" });
  });

  it("can be asked again after the dialog is cancelled", async () => {
    confirm.mockResolvedValue(false);
    await renderLoaded();

    await act(async () => deleteBtns()[1].click());
    await act(async () => deleteBtns()[1].click());

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});

describe("UsersSection loading state", () => {
  it("shows skeleton rows while the users are pending, then the table", async () => {
    const request = deferred<UserRecord[]>();
    getUsers.mockReturnValue(request.promise);
    render();

    expect(skeleton()).not.toBeNull();
    expect(loadingStatus()).toBe("Loading users…");
    expect(document.querySelectorAll(".settings-user-row.skeleton-static")).toHaveLength(4);
    // No "0 users" before the list arrives.
    expect(userCount()).toBe("");

    await act(async () => request.resolve(USERS));

    expect(skeleton()).toBeNull();
    expect(userCount()).toBe("2 users");
    expect(emails()).toEqual(["admin@example.com", "viewer@example.com"]);
  });

  it("drops the skeleton and keeps the existing error toast and empty table on failure", async () => {
    const request = deferred<UserRecord[]>();
    getUsers.mockReturnValue(request.promise);
    render();
    expect(skeleton()).not.toBeNull();

    await act(async () => request.reject(new Error("Forbidden")));

    expect(skeleton()).toBeNull();
    expect(status.show).toHaveBeenCalledWith({ kind: "error", title: "Error", message: "Forbidden" });
    expect(document.querySelector(".settings-users-empty")?.textContent).toBe("No users found");
  });
});
