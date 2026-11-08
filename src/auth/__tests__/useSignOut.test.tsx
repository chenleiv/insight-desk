import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StatusContext, type StatusApi } from "../../components/statusBar/statusContext";
import type { StatusMessage } from "../../components/statusBar/statusTypes";
import { useSignOut } from "../useSignOut";

const { logout } = vi.hoisted(() => ({ logout: vi.fn<() => Promise<void>>() }));
vi.mock("../useAuth", () => ({ useAuth: () => ({ logout }) }));

const status = { show: vi.fn<StatusApi["show"]>(), clear: vi.fn<StatusApi["clear"]>() };
const onSignedOut = vi.fn();

let api: ReturnType<typeof useSignOut>;
let container: HTMLDivElement;
let root: Root;

// Hands the hook's latest value to the test on every render.
function Probe({ expose, confirmLeave }: {
  expose: (value: ReturnType<typeof useSignOut>) => void;
  confirmLeave?: () => Promise<boolean>;
}) {
  expose(useSignOut({ ...(confirmLeave ? { confirmLeave } : {}), onSignedOut }));
  return null;
}

function render(confirmLeave?: () => Promise<boolean>) {
  act(() => root.render(
    <StatusContext.Provider value={status}>
      <Probe expose={(value) => { api = value; }} {...(confirmLeave ? { confirmLeave } : {})} />
    </StatusContext.Provider>,
  ));
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const lastToast = () => status.show.mock.lastCall?.[0] as Omit<StatusMessage, "id">;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  logout.mockReset();
  status.show.mockReset();
  status.clear.mockReset();
  onSignedOut.mockReset();
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

describe("useSignOut", () => {
  it("shows the wait until the server confirms, then clears it and reports success", async () => {
    const request = deferred();
    logout.mockReturnValue(request.promise);
    render();

    let run!: Promise<void>;
    act(() => { run = api.signOut(); });
    await act(async () => {});

    expect(api.isSigningOut).toBe(true);
    expect(lastToast()).toMatchObject({ kind: "info", message: "Signing out…", timeoutMs: 0 });
    expect(onSignedOut).not.toHaveBeenCalled();

    await act(async () => { request.resolve(); await run; });

    expect(api.isSigningOut).toBe(false);
    expect(status.clear).toHaveBeenCalledOnce();
    expect(onSignedOut).toHaveBeenCalledOnce();
  });

  it("stays put with an error and a Retry that stays until closed when the server fails", async () => {
    logout.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(undefined);
    render();

    await act(async () => { await api.signOut(); });

    expect(onSignedOut).not.toHaveBeenCalled();
    expect(status.clear).not.toHaveBeenCalled();
    expect(api.isSigningOut).toBe(false);
    expect(lastToast()).toMatchObject({
      kind: "error",
      message: "Could not sign out. You are still signed in.",
      actionLabel: "Retry",
      timeoutMs: 0,
    });

    await act(async () => {
      lastToast().onAction?.();
      await Promise.resolve();
    });
    await act(async () => {});

    expect(logout).toHaveBeenCalledTimes(2);
    expect(onSignedOut).toHaveBeenCalledOnce();
  });

  it("sends one request for a double click", async () => {
    const request = deferred();
    logout.mockReturnValue(request.promise);
    render();

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => { first = api.signOut(); second = api.signOut(); });
    await act(async () => {});
    expect(logout).toHaveBeenCalledOnce();

    await act(async () => { request.resolve(); await Promise.all([first, second]); });
    expect(onSignedOut).toHaveBeenCalledOnce();
  });

  it("does nothing when the user keeps their unsaved changes", async () => {
    render(async () => false);

    await act(async () => { await api.signOut(); });

    expect(logout).not.toHaveBeenCalled();
    expect(status.show).not.toHaveBeenCalled();
  });

  it("asks once even if clicked again while the question is open", async () => {
    let answer!: (ok: boolean) => void;
    const confirmLeave = vi.fn(() => new Promise<boolean>((resolve) => { answer = resolve; }));
    logout.mockResolvedValue(undefined);
    render(confirmLeave);

    let first!: Promise<void>;
    act(() => { first = api.signOut(); void api.signOut(); });
    expect(confirmLeave).toHaveBeenCalledOnce();

    await act(async () => { answer(true); await first; });
    expect(logout).toHaveBeenCalledOnce();
  });

  it("uses the current guard when Retry runs from an older toast", async () => {
    logout.mockRejectedValueOnce(new Error("down"));
    render(async () => true);
    await act(async () => { await api.signOut(); });
    const retry = lastToast().onAction;

    const newer = vi.fn(async () => false);
    render(newer);
    await act(async () => { retry?.(); await Promise.resolve(); });

    expect(newer).toHaveBeenCalledOnce();
    expect(logout).toHaveBeenCalledOnce();
  });
});
