import type { DocumentItem } from "../../../api/documentsClient";

/** Normalized key for palette lookup (trim, lowercase, collapse spaces). */
export function normalizeCategoryKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

const CATEGORY_ALIASES: Record<string, string> = {
  "ai-prompt": "ai prompt",
  ai_prompt: "ai prompt",
  aiprompt: "ai prompt",
};

/** Visual tokens for Research, Notes, AI Prompt, Report, Guide (+ teal for “All” in filters). */
export type CategoryVisual = {
  /** Icon tile background (dark tint of category). */
  iconBg: string;
  /** Icon glyph color. */
  iconFg: string;
  /** Footer tag pill background. */
  tagBg: string;
  /** Footer tag text. */
  tagFg: string;
  /** Inactive filter chip border (subtle category tint). */
  chipBorder: string;
};

const CATEGORY_PALETTE: Record<string, CategoryVisual> = {
  research: {
    iconBg: "rgba(37, 99, 235, 0.28)",
    iconFg: "#93c5fd",
    tagBg: "rgba(37, 99, 235, 0.22)",
    tagFg: "#60a5fa",
    chipBorder: "rgba(59, 130, 246, 0.45)",
  },
  notes: {
    iconBg: "rgba(180, 83, 9, 0.3)",
    iconFg: "#fcd34d",
    tagBg: "rgba(234, 179, 8, 0.2)",
    tagFg: "#fbbf24",
    chipBorder: "rgba(234, 179, 8, 0.45)",
  },
  "ai prompt": {
    iconBg: "rgba(109, 40, 217, 0.32)",
    iconFg: "#d8b4fe",
    tagBg: "rgba(168, 85, 247, 0.22)",
    tagFg: "#c084fc",
    chipBorder: "rgba(168, 85, 247, 0.45)",
  },
  report: {
    iconBg: "rgba(21, 128, 61, 0.3)",
    iconFg: "#86efac",
    tagBg: "rgba(34, 197, 94, 0.2)",
    tagFg: "#4ade80",
    chipBorder: "rgba(34, 197, 94, 0.45)",
  },
  guide: {
    iconBg: "rgba(127, 29, 29, 0.35)",
    iconFg: "#fca5a5",
    tagBg: "rgba(185, 28, 28, 0.25)",
    tagFg: "#f87171",
    chipBorder: "rgba(220, 38, 38, 0.5)",
  },
};

/** Teal accent for the “All” filter (matches active nav). */
export const FILTER_ALL_ACTIVE_BG = "#14b8a6";
export const FILTER_ALL_ACTIVE_FG = "#0a0a0a";

export function getCategoryVisual(category: string): CategoryVisual | null {
  let key = normalizeCategoryKey(category);
  key = CATEGORY_ALIASES[key] ?? key;
  return CATEGORY_PALETTE[key] ?? null;
}

function hashCategoryKey(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Stable HSL palette for categories not in the named map (e.g. General, Custom). */
export function getFallbackCategoryVisual(category: string): CategoryVisual {
  const key = normalizeCategoryKey(category);
  const hue = hashCategoryKey(key) % 360;
  return {
    iconBg: `hsla(${hue} 42% 42% / 0.35)`,
    iconFg: `hsl(${hue} 72% 74%)`,
    tagBg: `hsla(${hue} 38% 48% / 0.22)`,
    tagFg: `hsl(${hue} 65% 70%)`,
    chipBorder: `hsla(${hue} 45% 50% / 0.48)`,
  };
}

/** Named palette when defined; otherwise a deterministic color per string. */
export function resolveCategoryVisual(category: string): CategoryVisual {
  return getCategoryVisual(category) ?? getFallbackCategoryVisual(category);
}

export function getCategoryIconStyle(category: string): { backgroundColor: string; color: string } {
  const v = resolveCategoryVisual(category);
  return { backgroundColor: v.iconBg, color: v.iconFg };
}

export function getCategoryTagStyle(category: string): { backgroundColor: string; color: string } {
  const v = resolveCategoryVisual(category);
  return { backgroundColor: v.tagBg, color: v.tagFg };
}

export function getDocTags(doc: DocumentItem | null | undefined): string[] {
  if (!doc?.category || typeof doc.category !== "string") return [];
  return doc.category.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
}

export function getUniqueCategories(docs: DocumentItem[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const doc of docs) {
    for (const tag of getDocTags(doc)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function matchesCategory(doc: DocumentItem, category: string | null): boolean {
  if (!category || category === "all") return true;
  return getDocTags(doc).includes(category);
}

export function matchesQuery(d: DocumentItem, q: string) {
  const query = q.toLowerCase().trim();
  if (!query) return true;

  const title = (d.title ?? "").toLowerCase();
  const category = (d.category ?? "").toLowerCase();
  const summary = (d.summary ?? "").toLowerCase();
  const content = (d.content ?? "").toLowerCase();

  return (
    title.includes(query) ||
    category.includes(query) ||
    summary.includes(query) ||
    content.includes(query)
  );
}
