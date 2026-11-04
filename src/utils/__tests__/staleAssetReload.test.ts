import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { STALE_ASSET_RELOAD_KEY } from "../../storageKeys";
import { installStaleAssetReload, isReloadingForStaleAsset, STALE_ASSET_RELOAD_WINDOW_MS } from "../staleAssetReload";

const reload = vi.fn();
const items = new Map<string, string>();
let uninstall: () => void;

const failAsset = () => window.dispatchEvent(new Event("vite:preloadError"));

beforeEach(() => {
  vi.useFakeTimers();
  reload.mockClear();
  items.clear();
  vi.stubGlobal("location", { reload });
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => { items.set(k, v); },
  });
  uninstall = installStaleAssetReload();
});

afterEach(() => {
  uninstall();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("reload after a failed asset", () => {
  it("reloads when a lazy-loaded file fails", () => {
    failAsset();

    expect(reload).toHaveBeenCalledOnce();
    expect(isReloadingForStaleAsset()).toBe(true);
  });

  it("does not reload for a failure right after the reload, which would loop", () => {
    failAsset();
    // The page after the reload starts with the stored time only.
    vi.advanceTimersByTime(STALE_ASSET_RELOAD_WINDOW_MS - 1);
    failAsset();

    expect(reload).toHaveBeenCalledOnce();
  });

  it("reloads again for a failure later on, such as after another deploy", () => {
    failAsset();
    vi.advanceTimersByTime(STALE_ASSET_RELOAD_WINDOW_MS);
    failAsset();

    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("reloads when the stored time cannot be read as a number", () => {
    items.set(STALE_ASSET_RELOAD_KEY, "garbage");
    failAsset();

    expect(reload).toHaveBeenCalledOnce();
  });

  it("does not reload when storage is blocked, since nothing could stop a loop", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    });
    failAsset();

    expect(reload).not.toHaveBeenCalled();
  });
});
