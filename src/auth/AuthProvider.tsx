import React, { useEffect, useEffectEvent, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { me, logout as apiLogout } from "../api/authClient";
import { toggleFavorite as apiToggleFavorite } from "../api/documentsClient";
import { setUnauthorizedHandler, startSessionGeneration } from "../api/base";
import type { AuthUser } from "./authTypes";
import {
  loadUserFromStorage,
  saveUserToStorage,
  clearUserFromStorage,
} from "./authStorage";
import { AuthContext } from "./authContext";
import { CHAT_KEY } from "../storageKeys";
import { removeDemoScopedKeys } from "../utils/storage";
import { useSessionCheck } from "./useSessionCheck";

/** Removes the per-session keys; device preferences and a regular user's own keys stay. */
function clearSessionStorage() {
  localStorage.removeItem(CHAT_KEY);
  removeDemoScopedKeys();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() =>
    loadUserFromStorage(),
  );
  const [isReady, setIsReady] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  /** Whether a user is signed in, readable at once by the 401 handler before React re-renders. */
  const signedInRef = useRef(user !== null);
  const queryClient = useQueryClient();
  /** True after loginSuccess() — avoids clearing session when the initial /me (sent before the cookie existed) returns 401 after sign-in. */
  const sessionEstablishedByLogin = useRef(false);
  /** The running logout, shared by every caller so a second click cannot send another. */
  const logoutInFlight = useRef<Promise<void> | null>(null);
  /** Set before the first await: two clicks can land before React renders pendingFavorites. */
  const favoritesInFlight = useRef(new Set<string>());
  const [pendingFavorites, setPendingFavorites] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await me();
        if (cancelled) return;
        signedInRef.current = true;
        setUser(u);
        saveUserToStorage(u);
      } catch {
        if (cancelled) return;
        if (!sessionEstablishedByLogin.current) {
          signedInRef.current = false;
          setUser(null);
          clearUserFromStorage();
          // The previous session ended while the app was closed; drop what it left behind.
          clearSessionStorage();
        }
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Drops data cached for the previous session so the next user in this tab never sees it. */
  function resetSessionState() {
    queryClient.clear();
    clearSessionStorage();
  }

  /** Ends a session the server no longer accepts. Later 401s find no user and do nothing. */
  function expireSession() {
    // A 401 during logout is the logout itself taking effect, not an expired session.
    if (!signedInRef.current || logoutInFlight.current) return;
    signedInRef.current = false;
    sessionEstablishedByLogin.current = false;
    setUser(null);
    clearUserFromStorage();
    resetSessionState();
    setSessionExpired(true);
  }

  const onUnauthorized = useEffectEvent(expireSession);

  useSessionCheck(isReady && user !== null, expireSession);

  useEffect(() => {
    setUnauthorizedHandler(() => onUnauthorized());
    return () => setUnauthorizedHandler(null);
  }, []);

  /** Rejects if the server call fails: the cookie may still be valid, so the user stays signed in. */
  function doLogout() {
    logoutInFlight.current ??= endSessionOnServer().finally(() => {
      logoutInFlight.current = null;
    });
    return logoutInFlight.current;
  }

  async function endSessionOnServer() {
    // Before the server call, so no request of this session comes back as a 401 after it.
    void queryClient.cancelQueries();

    try {
      await apiLogout();
    } catch (err) {
      // Still signed in, so the requests cancelled above are needed again.
      void queryClient.invalidateQueries();
      throw err;
    }

    setSignedOut(true);
    signedInRef.current = false;
    sessionEstablishedByLogin.current = false;
    setUser(null);
    clearUserFromStorage();
    // After the server call, so no refetch with the old cookie can refill the cache.
    resetSessionState();
  }

  /** Changes one document only, for this user only: a late answer must not undo other changes or a sign-out. */
  function setFavorite(email: string, id: string, isFavorite: boolean) {
    setUser((prev) => {
      if (prev?.email !== email) return prev;
      const others = prev.favorites.filter((f) => f !== id);
      const next = { ...prev, favorites: isFavorite ? [...others, id] : others };
      saveUserToStorage(next);
      return next;
    });
  }

  /** Shows the change at once and undoes it if the server refuses. Rejects so the caller can say so. */
  async function toggleFavorite(id: string | number) {
    if (!user) return;

    const idStr = id.toString();
    if (favoritesInFlight.current.has(idStr)) return;
    favoritesInFlight.current.add(idStr);
    setPendingFavorites((prev) => ({ ...prev, [idStr]: true }));

    const { email } = user;
    const wasFavorite = user.favorites.includes(idStr);
    setFavorite(email, idStr, !wasFavorite);

    try {
      const resp = await apiToggleFavorite(idStr);
      setFavorite(email, idStr, resp.favorites.includes(idStr));
    } catch (err) {
      setFavorite(email, idStr, wasFavorite);
      throw err;
    } finally {
      favoritesInFlight.current.delete(idStr);
      setPendingFavorites((prev) => {
        const next = { ...prev };
        delete next[idStr];
        return next;
      });
    }
  }

  const favoritesMap = React.useMemo(() => {
    const map: Record<string | number, boolean> = {};
    user?.favorites?.forEach((id) => (map[id] = true));
    return map;
  }, [user]);

  return (
    <AuthContext
      value={{
        user,
        isReady,
        isAuthed: !!user,
        sessionExpired,
        signedOut,
        favoritesMap,
        pendingFavorites,
        loginSuccess: (u) => {
          startSessionGeneration();
          sessionEstablishedByLogin.current = true;
          signedInRef.current = true;
          setSessionExpired(false);
          setSignedOut(false);
          resetSessionState();
          setUser(u);
          saveUserToStorage(u);
        },
        updateUser: (patch) => {
          setUser((prev) => {
            if (!prev) return prev;
            const next = { ...prev, ...patch };
            saveUserToStorage(next);
            return next;
          });
        },
        logout: doLogout,
        toggleFavorite,
      }}
    >
      {children}
    </AuthContext>
  );
}
