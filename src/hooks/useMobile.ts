import { useSyncExternalStore } from "react";

// Cache per query so we don't recreate MediaQueryList on every render
const mqlCache = new Map<string, MediaQueryList>();

function getMql(query: string): MediaQueryList | null {
  if (typeof window === "undefined") return null;

  const cached = mqlCache.get(query);
  if (cached) return cached;

  const mql = window.matchMedia(query);
  mqlCache.set(query, mql);
  return mql;
}

export function useMobile(breakpoint = 768) {
  const query = `(max-width: ${breakpoint}px)`;

  const subscribe = (onStoreChange: () => void) => {
    const mql = getMql(query);
    if (!mql) return () => {};

    const handler = () => onStoreChange();
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  };

  const getSnapshot = () => {
    const mql = getMql(query);
    return mql ? mql.matches : false;
  };

  const getServerSnapshot = () => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
