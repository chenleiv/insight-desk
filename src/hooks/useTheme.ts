import { useEffect, useState } from "react";
import { loadJson, saveJson } from "../utils/storage";

const THEME_KEY = "theme";
export type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  const saved = loadJson<Theme | null>(THEME_KEY, null);
  if (saved === "light" || saved === "dark") return saved;

  const systemDark = window.matchMedia?.(
    "(prefers-color-scheme: dark)",
  ).matches;
  return systemDark ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    saveJson(THEME_KEY, theme);
  }, [theme]);

  return { theme, setTheme };
}
