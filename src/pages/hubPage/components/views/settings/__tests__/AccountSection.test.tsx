import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StatusContext, type StatusApi } from "../../../../../../components/statusBar/statusContext";
import { AccountSection } from "../AccountSection";
import { changePassword } from "../../../../../../api/authClient";

const { auth } = vi.hoisted(() => ({
  auth: {
    user: { email: "visitor@example.com", role: "admin" as string, favorites: [] },
    updateUser: () => {},
  },
}));

vi.mock("../../../../../../auth/useAuth", () => ({ useAuth: () => auth }));
vi.mock("../../../../../../api/authClient", () => ({
  changePassword: vi.fn(),
  updateProfile: vi.fn(),
}));

const KEYS = ["insight-desk:welcomed", "insight-desk:doc-toured", "insight-desk:new-doc-toured"];

const status: StatusApi = { show: vi.fn(), clear: vi.fn() };

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

function renderSection() {
  act(() => root.render(
    <StatusContext.Provider value={status}>
      <AccountSection />
    </StatusContext.Provider>
  ));
}

const guidesBtn = () =>
  [...document.querySelectorAll("button")].find((b) => b.textContent === "Show the guides again");

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", memoryStorage());
  vi.mocked(status.show).mockReset();
  auth.user = { email: "visitor@example.com", role: "admin", favorites: [] };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("AccountSection guides control", () => {
  it.each(["admin", "viewer", "demo"])("clears the guide keys for a %s and confirms it", (role) => {
    auth.user = { ...auth.user, role };
    for (const key of KEYS) localStorage.setItem(key, "1");
    localStorage.setItem("theme", "dark");
    renderSection();

    act(() => guidesBtn()!.click());

    expect(KEYS.map((k) => localStorage.getItem(k))).toEqual([null, null, null]);
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(status.show).toHaveBeenCalledExactlyOnceWith({
      kind: "success",
      message: "The guides will show again.",
    });
  });
});

describe("AccountSection password form", () => {
  async function submitNewPassword(next: string) {
    renderSection();
    const toggle = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Change password"))!;
    act(() => toggle.click());
    const form = container.querySelector('input[name="next"]')!.closest("form") as HTMLFormElement;
    (form.querySelector('input[name="current"]') as HTMLInputElement).value = "old-password";
    (form.querySelector('input[name="next"]') as HTMLInputElement).value = next;
    (form.querySelector('input[name="confirm"]') as HTMLInputElement).value = next;
    await act(async () => {
      form.requestSubmit();
    });
  }

  beforeEach(() => vi.mocked(changePassword).mockReset());

  it("stops a new password shorter than 12 characters before calling the server", async () => {
    await submitNewPassword("x".repeat(11));

    expect(changePassword).not.toHaveBeenCalled();
    expect(container.textContent).toContain("at least 12 characters");
  });

  it("sends a new password of 12 characters", async () => {
    vi.mocked(changePassword).mockResolvedValue({ ok: true });

    await submitNewPassword("x".repeat(12));

    expect(changePassword).toHaveBeenCalledWith("old-password", "x".repeat(12));
  });
});
