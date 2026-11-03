import { useSyncExternalStore } from "react";

// Smaller changes are the browser's address bar collapsing; a keyboard is always taller.
const MIN_KEYBOARD_HEIGHT = 150;
// Above this scale the user has pinched in, which shrinks the visual viewport too.
const ZOOM_TOLERANCE = 1.01;
const NON_TEXT_INPUTS = new Set(["button", "checkbox", "color", "file", "image", "radio", "range", "reset", "submit"]);

// The tallest visible height at the current width, which is the height without a keyboard.
let fullHeight = 0;
let measuredWidth = 0;

function measure(viewport: VisualViewport) {
  if (viewport.width !== measuredWidth) {
    measuredWidth = viewport.width;
    fullHeight = viewport.height;
  } else if (viewport.scale <= ZOOM_TOLERANCE) {
    fullHeight = Math.max(fullHeight, viewport.height);
  }
}

function isTextEntry(el: Element | null): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

function subscribe(onChange: () => void) {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};

  measuredWidth = 0;
  measure(viewport);
  const onResize = () => {
    measure(viewport);
    onChange();
  };

  viewport.addEventListener("resize", onResize);
  document.addEventListener("focusin", onChange);
  document.addEventListener("focusout", onChange);
  return () => {
    viewport.removeEventListener("resize", onResize);
    document.removeEventListener("focusin", onChange);
    document.removeEventListener("focusout", onChange);
  };
}

function getSnapshot(): boolean {
  const viewport = window.visualViewport;
  if (!viewport || viewport.scale > ZOOM_TOLERANCE) return false;
  return isTextEntry(document.activeElement) && fullHeight - viewport.height > MIN_KEYBOARD_HEIGHT;
}

/**
 * True while the on-screen keyboard covers part of the page. Needs both signals: a focused
 * field alone stays true after Android's Back closes the keyboard, and a shorter viewport
 * alone also happens without a keyboard.
 */
export function useKeyboardOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
