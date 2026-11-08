import type { DocumentItem } from "../../../api/documentsClient";
import { getCategoryHue, CAT_HUES } from "./categoryColorStore";

function normalizeCategoryKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

const CATEGORY_ALIASES: Record<string, string> = {
  "ai-prompt": "ai prompt",
  ai_prompt: "ai prompt",
  aiprompt: "ai prompt",
};

/** Visual tokens for Research, Notes, AI Prompt, Report, Guide (+ teal for “All” in filters). */
type CategoryVisual = {
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
  linux: catVars("linux"),
};

function categoryKey(category: string): string {
  const key = normalizeCategoryKey(category);
  return CATEGORY_ALIASES[key] ?? key;
}

function getCategoryVisual(category: string): CategoryVisual | null {
  return CATEGORY_PALETTE[categoryKey(category)] ?? null;
}

function hueToVisual(hue: number): CategoryVisual {
  return {
    iconBg:     `light-dark(hsla(${hue} 70% 45% / 0.12), hsla(${hue} 55% 55% / 0.22))`,
    iconFg:     `light-dark(hsl(${hue} 75% 28%), hsl(${hue} 80% 72%))`,
    tagBg:      `light-dark(hsla(${hue} 70% 45% / 0.1), hsla(${hue} 50% 55% / 0.18))`,
    tagFg:      `light-dark(hsl(${hue} 75% 28%), hsl(${hue} 80% 72%))`,
    chipBorder: `light-dark(hsla(${hue} 60% 45% / 0.35), hsla(${hue} 60% 60% / 0.45))`,
  };
}

function getFallbackCategoryVisual(category: string): CategoryVisual {
  const storedHue = getCategoryHue(category);
  if (storedHue !== null) return hueToVisual(storedHue);
  // Ultimate fallback for categories not yet in the store (e.g. first render race)
  const key = normalizeCategoryKey(category);
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  return hueToVisual(CAT_HUES[Math.abs(h) % CAT_HUES.length]);
}

/** Named palette when defined; otherwise a deterministic color per string. */
function resolveCategoryVisual(category: string): CategoryVisual {
  return getCategoryVisual(category) ?? getFallbackCategoryVisual(category);
}

export function getCategoryIconStyle(category: string): {
  backgroundColor: string;
  color: string;
} {
  const v = resolveCategoryVisual(category);
  return { backgroundColor: v.iconBg, color: v.iconFg };
}


export function getCategoryChipStyle(category: string): {
  backgroundColor: string;
  color: string;
  borderColor: string;
} {
  const v = resolveCategoryVisual(category);
  return { backgroundColor: v.tagBg, color: v.tagFg, borderColor: v.chipBorder };
}

export function getDocTags(doc: DocumentItem | null | undefined): string[] {
  if (!doc?.category || typeof doc.category !== "string") return [];
  return doc.category
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export type CategoryOption = { key: string; label: string };

/**
 * The categories used by these documents, for a filter. A document's list ("A, B") counts
 * as each of its parts. Spellings of one category are merged and the first one is shown.
 */
export function getCategoryOptions(docs: DocumentItem[]): CategoryOption[] {
  const labels = new Map<string, string>();
  for (const doc of docs) {
    for (const tag of getDocTags(doc)) {
      const key = categoryKey(tag);
      if (!labels.has(key)) labels.set(key, tag);
    }
  }
  return [...labels]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function docHasCategory(doc: DocumentItem, key: string): boolean {
  return getDocTags(doc).some((tag) => categoryKey(tag) === key);
}

