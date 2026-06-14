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
