import { useEffect, useEffectEvent } from "react";
import { me } from "../api/authClient";
import { ApiError } from "../api/base";

export const SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
/** Focus and visibility can flip often; checks closer together than this are skipped. */
export const SESSION_CHECK_MIN_GAP_MS = 30 * 1000;

/**
 * While enabled, asks the server whether the session is still valid when the tab becomes
 * visible, when the window regains focus, and on a slow timer. Calls onExpired on a 401 only:
 * a network or server error says nothing about the session.
 */
export function useSessionCheck(enabled: boolean, onExpired: () => void) {
  const handleExpired = useEffectEvent(onExpired);

  useEffect(() => {
    if (!enabled) return;

    let inFlight = false;
    let lastCheck = Date.now();
    let active = true;

    async function check() {
      if (inFlight || Date.now() - lastCheck < SESSION_CHECK_MIN_GAP_MS) return;
      inFlight = true;
      lastCheck = Date.now();
      try {
        await me();
      } catch (err) {
        if (active && err instanceof ApiError && err.status === 401) handleExpired();
      } finally {
        inFlight = false;
      }
    }

    function checkIfVisible() {
      if (document.visibilityState === "visible") void check();
    }

    document.addEventListener("visibilitychange", checkIfVisible);
    window.addEventListener("focus", checkIfVisible);
    const timer = window.setInterval(checkIfVisible, SESSION_CHECK_INTERVAL_MS);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", checkIfVisible);
      window.removeEventListener("focus", checkIfVisible);
      window.clearInterval(timer);
    };
  }, [enabled]);
}
