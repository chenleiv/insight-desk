import React, { useEffect, useState } from "react";
import { me, logout as apiLogout } from "../api/authClient";
import { toggleFavorite as apiToggleFavorite } from "../api/documentsClient";
import type { AuthUser } from "./authTypes";
import { AUTH_USER_KEY } from "./authTypes";
import { loadUserFromStorage } from "./authStorage";
import { AuthContext } from "./authContext";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() =>
    loadUserFromStorage(),
  );
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const u = await me();
        setUser(u);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(u));
      } catch {
        setUser(null);
        localStorage.removeItem(AUTH_USER_KEY);
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  async function doLogout() {
    setUser(null);
    localStorage.removeItem(AUTH_USER_KEY);

    try {
      await apiLogout();
    } catch (err) {
      console.warn("logout failed", err);
    }
  }

  async function toggleFavorite(id: string | number) {
    if (!user) return;

    const idStr = id.toString();
    const isFav = user.favorites.includes(idStr);

    // Optimistic update
    const nextFavorites = isFav
      ? user.favorites.filter((f) => f !== idStr)
      : [...user.favorites, idStr];

    setUser({ ...user, favorites: nextFavorites });

    try {
      const resp = await apiToggleFavorite(idStr);
      // Sync with server response
      setUser({ ...user, favorites: resp.favorites });
    } catch (err) {
      console.error("toggle favorite failed", err);
      // Rollback
      setUser(user);
      throw err;
    }
  }

  return (
    <AuthContext
      value={{
        user,
        isReady,
        isAuthed: !!user,
        loginSuccess: (u) => {
          setUser(u);
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(u));
        },
        logout: doLogout,
        toggleFavorite,
      }}
    >
      {children}
    </AuthContext>
  );
}
