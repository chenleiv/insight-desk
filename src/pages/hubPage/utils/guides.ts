import { useSyncExternalStore } from "react";
import type { TourOutcome } from "../components/dialogs/TourOverlay";

// Per-browser keys, not per-user: they survive logout, so a skip is remembered for demo accounts too.
const GUIDE_KEYS = {
  welcome: "insight-desk:welcomed",
  doc: "insight-desk:doc-toured",
  newDoc: "insight-desk:new-doc-toured",
} as const;

export type GuideId = keyof typeof GUIDE_KEYS;

const GUIDE_IDS = Object.keys(GUIDE_KEYS) as GuideId[];

// Guides finished while storage refuses writes; without this a tour could never close.
const doneWithoutStorage = new Set<GuideId>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Fires for changes made in other tabs of this browser.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function isGuideDone(id: GuideId): boolean {
  if (doneWithoutStorage.has(id)) return true;
  try {
    return !!localStorage.getItem(GUIDE_KEYS[id]);
  } catch {
    return false;
  }
}

function writeDone(id: GuideId) {
  try {
    localStorage.setItem(GUIDE_KEYS[id], "1");
  } catch {
    doneWithoutStorage.add(id);
  }
}

export function useGuideDone(id: GuideId): boolean {
  return useSyncExternalStore(subscribe, () => isGuideDone(id));
}

/** Marks one guide as done, leaving the others to appear on their own first use. */
export function markGuideDone(id: GuideId): void {
  writeDone(id);
  notify();
}

/** The decision not to follow a guide applies to all of them. */
export function skipAllGuides(): void {
  GUIDE_IDS.forEach(writeDone);
  notify();
}

/** Applies the rule for a tour that ended: finishing it marks it alone, skipping it marks all. */
export function finishTour(id: GuideId, outcome: TourOutcome): void {
  if (outcome === "skipped") skipAllGuides();
  else markGuideDone(id);
}

/** Makes every guide appear again from its first use. */
export function resetGuides(): void {
  doneWithoutStorage.clear();
  for (const id of GUIDE_IDS) {
    try {
      localStorage.removeItem(GUIDE_KEYS[id]);
    } catch {
      // Ignore storage errors
    }
  }
  notify();
}
