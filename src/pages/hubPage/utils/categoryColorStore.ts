const STORAGE_KEY = "brainy:category-colors";

// 20 perceptually distinct hues
export const CAT_HUES = [
  215, 15, 145, 275, 350, 185, 50, 305, 95, 250,
  330, 170, 30, 260, 120, 340, 80, 230, 165, 295,
];

type ColorMap = Record<string, number>; // category key → hue index

let _cache: ColorMap | null = null;

function load(): ColorMap {
  if (_cache) return _cache;
  try {
    _cache = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    _cache = {};
  }
  return _cache!;
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
