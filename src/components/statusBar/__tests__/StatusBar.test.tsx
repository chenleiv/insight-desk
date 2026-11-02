import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, use } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StatusProvider } from "../StatusProvider";
import { StatusContext, type StatusApi } from "../statusContext";

let api: StatusApi;
let container: HTMLDivElement;
let root: Root;

function Probe() {
  api = use(StatusContext)!;
  return null;
}

const card = () => document.querySelector<HTMLElement>(".statusbar");
const closeBtn = () => document.querySelector<HTMLButtonElement>(".statusbar-close")!;
const region = (role: string) => document.querySelector<HTMLElement>(`[role="${role}"]`)!;

function show(msg: Parameters<StatusApi["show"]>[0]) {
  act(() => api.show(msg));
}

function advance(ms: number) {
  act(() => { vi.advanceTimersByTime(ms); });
}

function pointerEnter() {
  act(() => { card()!.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })); });
}

function pointerLeave() {
  act(() => {
    card()!.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body }));
  });
}

function setPageHidden(hidden: boolean) {
  vi.spyOn(document, "hidden", "get").mockReturnValue(hidden);
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
}

const ERROR = { kind: "error", title: "Upload failed", message: "Too large" } as const;
const SUCCESS = { kind: "success", message: "Saved" } as const;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<StatusProvider><Probe /></StatusProvider>));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("status toast timing", () => {
  it("dismisses an error after 10 seconds", () => {
    show(ERROR);
    advance(9999);
    expect(card()).not.toBeNull();
    advance(1);
    expect(card()).toBeNull();
  });

  it.each(["success", "info"] as const)("dismisses a %s toast after 4 seconds", (kind) => {
    show({ kind, message: "Done" });
    advance(3999);
    expect(card()).not.toBeNull();
    advance(1);
    expect(card()).toBeNull();
  });

  it("keeps a toast with no timeout until it is closed", () => {
    show({ ...ERROR, timeoutMs: 0 });
    advance(60000);
    expect(card()).not.toBeNull();
    act(() => closeBtn().click());
    expect(card()).toBeNull();
  });

  it("gives a replacing toast its own full time", () => {
    show(ERROR);
    advance(9000);
    show(SUCCESS);
    advance(3999);
    expect(card()!.textContent).toContain("Saved");
    advance(1);
    expect(card()).toBeNull();
  });
});

describe("status toast pause", () => {
  it("pauses while the pointer is over it and resumes with the time left", () => {
    show(ERROR);
    advance(6000);
    pointerEnter();
    advance(60000);
    expect(card()).not.toBeNull();

    pointerLeave();
    advance(3999);
    expect(card()).not.toBeNull();
    advance(1);
    expect(card()).toBeNull();
  });

  it("pauses while it holds keyboard focus and resumes when focus leaves", () => {
    show(ERROR);
    advance(6000);
    act(() => closeBtn().focus());
    advance(60000);
    expect(card()).not.toBeNull();

    act(() => closeBtn().blur());
    advance(4000);
    expect(card()).toBeNull();
  });

  it("stays paused until both the pointer and focus have left", () => {
    show(ERROR);
    pointerEnter();
    act(() => closeBtn().focus());
    pointerLeave();
    advance(60000);
    expect(card()).not.toBeNull();

    act(() => closeBtn().blur());
    advance(10000);
    expect(card()).toBeNull();
  });

  it("pauses while the tab is hidden", () => {
    show(ERROR);
    advance(6000);
    setPageHidden(true);
    advance(60000);
    expect(card()).not.toBeNull();

    setPageHidden(false);
    advance(4000);
    expect(card()).toBeNull();
  });

  it("does not stay paused for the next toast after closing one under the pointer", () => {
    show(ERROR);
    pointerEnter();
    act(() => closeBtn().focus());
    act(() => closeBtn().click());
    expect(card()).toBeNull();

    show(SUCCESS);
    advance(4000);
    expect(card()).toBeNull();
  });
});

describe("status toast announcements", () => {
  it("keeps both live regions mounted before any message arrives", () => {
    expect(region("status").getAttribute("aria-live")).toBe("polite");
    expect(region("alert").getAttribute("aria-live")).toBe("assertive");
    expect(region("status").textContent).toBe("");
    expect(region("alert").textContent).toBe("");
  });

  it("announces errors in the alert region", () => {
    show(ERROR);
    expect(region("alert").textContent).toContain("Upload failed");
    expect(region("status").textContent).toBe("");
  });

  it("announces other toasts in the status region", () => {
    show(SUCCESS);
    expect(region("status").textContent).toContain("Saved");
    expect(region("alert").textContent).toBe("");
  });

  it("gives the close button an accessible name", () => {
    show(SUCCESS);
    expect(closeBtn().getAttribute("aria-label")).toBe("Dismiss notification");
  });
});
