const STORAGE_KEY = "insightdesk:category-colors";
// Colors were saved under this key before the product was renamed.
const LEGACY_STORAGE_KEY = "brainy:category-colors";

// 20 perceptually distinct hues
export const CAT_HUES = [
  215, 15, 145, 275, 350, 185, 50, 305, 95, 250,
  330, 170, 30, 260, 120, 340, 80, 230, 165, 295,
];

type ColorMap = Record<string, number>; // category key → hue index

let _cache: ColorMap | null = null;

/** The saved map, or null when the value is missing or is not a JSON object. */
function parseColorMap(raw: string | null): ColorMap | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as ColorMap) : null;
  } catch {
    return null;
  }
}

/**
 * Read the saved colors. Colors still under the old key are moved to the new
 * one once; when both exist, the new key wins and the old one is removed.
 */
function readStored(): ColorMap {
  const current = localStorage.getItem(STORAGE_KEY);
  const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (current === null && legacyRaw !== null) {
    const legacy = parseColorMap(legacyRaw);
    try {
      if (legacy) localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Storage is full or read-only: keep the old key, so the next visit tries again.
    }
    return legacy ?? {};
  }
  if (legacyRaw !== null) {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Harmless: the new key is read first.
    }
  }
  return parseColorMap(current) ?? {};
}

function load(): ColorMap {
  if (_cache) return _cache;
  try {
    _cache = readStored();
  } catch {
    // Storage is unavailable, for example blocked by the browser.
    _cache = {};
  }
  return _cache;
}

function toKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Returns the hue for a category, or null if unknown. */
export function getCategoryHue(name: string): number | null {
  const map = load();
  const idx = map[toKey(name)];
  return idx !== undefined ? CAT_HUES[idx % CAT_HUES.length] : null;
}
