import React, { useEffect, useState } from "react";
import { me, logout as apiLogout } from "../api/authClient";
import { toggleFavorite as apiToggleFavorite } from "../api/documentsClient";
import type { AuthUser } from "./authTypes";
import {
  loadUserFromStorage,
  saveUserToStorage,
  clearUserFromStorage,
} from "./authStorage";
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
        saveUserToStorage(u);
      } catch {
        setUser(null);
        clearUserFromStorage();
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  async function doLogout() {
    setUser(null);
    clearUserFromStorage();

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
      const nextUser = { ...user, favorites: resp.favorites };
      setUser(nextUser);
      saveUserToStorage(nextUser);
    } catch (err) {
      console.error("toggle favorite failed", err);
      // Rollback
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
          setUser(u);
          saveUserToStorage(u);
        },
        logout: doLogout,
        toggleFavorite,
      }}
    >
      {children}
    </AuthContext>
  );
}
