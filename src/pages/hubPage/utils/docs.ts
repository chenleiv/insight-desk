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

function catVars(key: string): CategoryVisual {
  const p = `--cat-${key}`;
  return {
    iconBg: `var(${p}-icon-bg)`,
    iconFg: `var(${p}-icon-fg)`,
    tagBg: `var(${p}-tag-bg)`,
    tagFg: `var(${p}-tag-fg)`,
    chipBorder: `var(${p}-chip-border)`,
  };
}

const CATEGORY_PALETTE: Record<string, CategoryVisual> = {
  research: catVars("research"),
  notes: catVars("notes"),
  "ai prompt": catVars("ai"),
  report: catVars("report"),
  guide: catVars("guide"),
  security: catVars("security"),
  backend: catVars("backend"),
  frontend: catVars("frontend"),
  devops: catVars("devops"),
};


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
  const isLight = typeof document !== "undefined" &&
    document.documentElement.dataset.theme === "light";
  if (isLight) {
    return {
      iconBg: `hsla(${hue} 60% 45% / 0.12)`,
      iconFg: `hsl(${hue} 65% 30%)`,
      tagBg: `hsla(${hue} 60% 45% / 0.1)`,
      tagFg: `hsl(${hue} 65% 30%)`,
      chipBorder: `hsla(${hue} 50% 45% / 0.35)`,
    };
  }
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
