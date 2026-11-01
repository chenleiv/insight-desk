export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors
  }
}

export function scopedKey(baseKey: string, userEmail?: string | null): string {
  const user = userEmail?.trim().toLowerCase() || "anonymous";
  const env = window.location.host;
  return `${baseKey}::${user}::${env}`;
}

// Mirrors the demo email domain in backend/demo.js.
const DEMO_EMAIL_DOMAIN = "@demo.invalid";

/** Removes keys scoped to demo users: each demo email is used once, so its keys are never read again. */
export function removeDemoScopedKeys(): void {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    for (const key of keys) {
      if (key?.split("::")[1]?.endsWith(DEMO_EMAIL_DOMAIN)) localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage errors
  }
}
