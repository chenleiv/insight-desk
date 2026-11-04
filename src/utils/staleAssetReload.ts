import { STALE_ASSET_RELOAD_KEY } from "../storageKeys";

// A second failure this soon after reloading means reloading does not help: the file is
// truly unavailable. Later failures, such as from another deploy, may reload again.
export const STALE_ASSET_RELOAD_WINDOW_MS = 60 * 1000;

let reloading = false;

/** True once a reload has started, so the error page does not flash while the page goes away. */
export function isReloadingForStaleAsset() {
  return reloading;
}

/** Without working storage nothing can stop a loop, so the error page is shown instead. */
function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(STALE_ASSET_RELOAD_KEY));
    if (Date.now() - last < STALE_ASSET_RELOAD_WINDOW_MS) return;
    sessionStorage.setItem(STALE_ASSET_RELOAD_KEY, String(Date.now()));
  } catch {
    return;
  }
  reloading = true;
  window.location.reload();
}

/**
 * After a deploy, an open tab still asks for the old build's lazy-loaded files, which are gone.
 * Vite reports that with this event; the new page from a reload asks for the current files.
 * The failed import still rejects, so if no reload happens the error page shows.
 */
export function installStaleAssetReload() {
  window.addEventListener("vite:preloadError", reloadOnce);
  return () => window.removeEventListener("vite:preloadError", reloadOnce);
}
