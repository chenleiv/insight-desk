import { useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "./useAuth";
import { useStatus } from "../components/statusBar/useStatus";

type Options = {
  /** Asked first, for example about unsaved changes. Returning false cancels the sign-out. */
  confirmLeave?: () => Promise<boolean>;
  onSignedOut?: () => void;
};

/**
 * Signs out and reports progress. The user is told they are signed out only after the server
 * confirms it; on a failure they stay where they are, with an error and a Retry button.
 */
export function useSignOut({ confirmLeave, onSignedOut }: Options = {}) {
  const { logout } = useAuth();
  const status = useStatus();
  const [isSigningOut, setIsSigningOut] = useState(false);
  // Set before the first await: two clicks can land before React renders isSigningOut.
  // Shared, so a repeat caller waits for the same result instead of finishing at once.
  const inFlightRef = useRef<Promise<void> | null>(null);

  // Retry runs from a toast created in an earlier render and must see the current guard.
  const confirmLeaveRef = useRef(confirmLeave);
  useLayoutEffect(() => {
    confirmLeaveRef.current = confirmLeave;
  });

  function signOut() {
    inFlightRef.current ??= run().finally(() => {
      inFlightRef.current = null;
    });
    return inFlightRef.current;
  }

  async function run() {
    try {
      if (confirmLeaveRef.current && !(await confirmLeaveRef.current())) return;
      setIsSigningOut(true);
      // A menu may close at once, so the toast is what shows the wait.
      status.show({ kind: "info", message: "Signing out…", timeoutMs: 0 });
      await logout();
      status.clear();
      onSignedOut?.();
    } catch {
      status.show({
        kind: "error",
        title: "Sign out failed",
        message: "Could not sign out. You are still signed in.",
        actionLabel: "Retry",
        onAction: () => void signOut(),
        // Stays until closed: the session is still open and the user asked to end it.
        timeoutMs: 0,
      });
    } finally {
      setIsSigningOut(false);
    }
  }

  return { signOut, isSigningOut };
}
