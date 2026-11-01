import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ApiError } from "../../api/base";
import { useSessionCheck, SESSION_CHECK_INTERVAL_MS, SESSION_CHECK_MIN_GAP_MS } from "../useSessionCheck";

const { meMock } = vi.hoisted(() => ({ meMock: vi.fn() }));

vi.mock("../../api/authClient", () => ({ me: meMock }));

const onExpired = vi.fn();
let visibility: DocumentVisibilityState;
let container: HTMLDivElement;
let root: Root;

function Harness({ enabled }: { enabled: boolean }) {
  useSessionCheck(enabled, onExpired);
  return null;
}

function render(enabled: boolean) {
  act(() => root.render(<Harness enabled={enabled} />));
}

// Lets the pending me() promise settle inside act.
async function flush() {
  await act(async () => {});
}

function becomeVisible() {
  visibility = "visible";
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  meMock.mockReset().mockResolvedValue({ email: "a@example.com" });
  onExpired.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useSessionCheck", () => {
  it("checks the session when the tab becomes visible", async () => {
    render(true);
    vi.advanceTimersByTime(SESSION_CHECK_MIN_GAP_MS);

    becomeVisible();
    await flush();

    expect(meMock).toHaveBeenCalledOnce();
  });

  it("checks the session when the window regains focus", async () => {
    render(true);
    vi.advanceTimersByTime(SESSION_CHECK_MIN_GAP_MS);

    window.dispatchEvent(new Event("focus"));
    await flush();

    expect(meMock).toHaveBeenCalledOnce();
  });

  it("checks on the timer only while the tab is visible", async () => {
    render(true);
    visibility = "hidden";
    vi.advanceTimersByTime(SESSION_CHECK_INTERVAL_MS);
    await flush();
    expect(meMock).not.toHaveBeenCalled();

    visibility = "visible";
    vi.advanceTimersByTime(SESSION_CHECK_INTERVAL_MS);
    await flush();
    expect(meMock).toHaveBeenCalledOnce();
  });

  it("sends one request when focus flips often", async () => {
    render(true);
    vi.advanceTimersByTime(SESSION_CHECK_MIN_GAP_MS);

    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new Event("focus"));
      becomeVisible();
      vi.advanceTimersByTime(1000);
    }
    await flush();

    expect(meMock).toHaveBeenCalledOnce();
  });

  it("does not start a second request while one is in flight", async () => {
    meMock.mockReturnValue(new Promise(() => {}));
    render(true);
    vi.advanceTimersByTime(SESSION_CHECK_MIN_GAP_MS);

    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(SESSION_CHECK_MIN_GAP_MS);
    window.dispatchEvent(new Event("focus"));

    expect(meMock).toHaveBeenCalledOnce();
  });

  it("sends no requests while disabled", async () => {
    render(false);
    vi.advanceTimersByTime(SESSION_CHECK_INTERVAL_MS * 2);
    window.dispatchEvent(new Event("focus"));
    becomeVisible();
    await flush();

    expect(meMock).not.toHaveBeenCalled();
  });

  it("reports an expired session on a 401", async () => {
    meMock.mockRejectedValue(new ApiError("Invalid token", 401));
    render(true);
    vi.advanceTimersByTime(SESSION_CHECK_MIN_GAP_MS);

    window.dispatchEvent(new Event("focus"));
    await flush();

    expect(onExpired).toHaveBeenCalledOnce();
  });

  it.each([
    ["a server error", new ApiError("Internal server error", 500)],
    ["a network error", new TypeError("Failed to fetch")],
  ])("keeps the session on %s", async (_name, error) => {
    meMock.mockRejectedValue(error);
    render(true);
    vi.advanceTimersByTime(SESSION_CHECK_MIN_GAP_MS);

    window.dispatchEvent(new Event("focus"));
    await flush();

    expect(meMock).toHaveBeenCalledOnce();
    expect(onExpired).not.toHaveBeenCalled();
  });
});
