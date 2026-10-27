import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker, useLocation } from "react-router-dom";
import useConfirm from "../../../hooks/useConfirm";

const DISCARD_DIALOG = {
  title: "Unsaved Changes",
  message: "Discard unsaved changes?",
  confirmLabel: "Discard",
  variant: "danger",
} as const;

/**
 * Tracks whether the open pane has unsaved changes and asks before they are lost.
 * In-app navigation calls guardDirty() first; browser back/forward and links are
 * caught by a router blocker. Needs a data router (createBrowserRouter).
 */
export function useUnsavedChangesGuard() {
  const confirm = useConfirm();
  const location = useLocation();
  const [isDirty, setIsDirty] = useState(false);

  // Read by the blocker at navigation time. clearDirty updates it synchronously,
  // so a navigation that was already confirmed is not blocked a second time.
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = isDirty; }, [isDirty]);

  const clearDirty = useCallback(() => {
    dirtyRef.current = false;
    setIsDirty(false);
  }, []);

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirtyRef.current &&
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search)
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    void confirm(DISCARD_DIALOG).then((ok) => {
      if (ok) {
        clearDirty();
        blocker.proceed();
      } else {
        blocker.reset();
      }
    });
  }, [blocker, confirm, clearDirty]);

  // The pane that set the flag is gone after any navigation.
  const [prevLocationKey, setPrevLocationKey] = useState(location.key);
  if (location.key !== prevLocationKey) {
    setPrevLocationKey(location.key);
    setIsDirty(false);
  }

  async function guardDirty(): Promise<boolean> {
    if (!isDirty) return true;
    const ok = await confirm(DISCARD_DIALOG);
    if (ok) clearDirty();
    return ok;
  }

  return { isDirty, setIsDirty, clearDirty, guardDirty };
}
