import React, { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { me, logout as apiLogout } from "../api/authClient";
import { toggleFavorite as apiToggleFavorite } from "../api/documentsClient";
import type { AuthUser } from "./authTypes";
import {
  loadUserFromStorage,
  saveUserToStorage,
  clearUserFromStorage,
} from "./authStorage";
import { AuthContext } from "./authContext";
import { CHAT_KEY } from "../pages/hubPage/utils/assistantUtils";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() =>
    loadUserFromStorage(),
  );
  const [isReady, setIsReady] = useState(false);
  const queryClient = useQueryClient();
  /** True after loginSuccess() — avoids clearing session when the initial /me (sent before the cookie existed) returns 401 after sign-in. */
  const sessionEstablishedByLogin = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await me();
        if (cancelled) return;
        setUser(u);
        saveUserToStorage(u);
      } catch {
        if (cancelled) return;
        if (!sessionEstablishedByLogin.current) {
          setUser(null);
          clearUserFromStorage();
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
    localStorage.removeItem(CHAT_KEY);
  }

  async function doLogout() {
    sessionEstablishedByLogin.current = false;
    setUser(null);
    clearUserFromStorage();

    try {
      await apiLogout();
    } catch (err) {
      console.warn("logout failed", err);
    } finally {
      // After the server call, so no refetch with the old cookie can refill the cache.
      resetSessionState();
    }
  }

  async function toggleFavorite(id: string | number) {
    if (!user) return;

    const idStr = id.toString();
    const isFav = user.favorites.includes(idStr);

    const nextFavorites = isFav
      ? user.favorites.filter((f) => f !== idStr)
      : [...user.favorites, idStr];

    setUser({ ...user, favorites: nextFavorites });

    try {
      const resp = await apiToggleFavorite(idStr);
      const nextUser = { ...user, favorites: resp.favorites };
      setUser(nextUser);
      saveUserToStorage(nextUser);
    } catch (err) {
      console.error("toggle favorite failed", err);
      setUser(user);
      saveUserToStorage(user);
      throw err;
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
        favoritesMap,
        loginSuccess: (u) => {
          sessionEstablishedByLogin.current = true;
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
