import { describe, it, expect } from "vitest";
import { compile } from "sass";

// jsdom has no layout and drops values that use env() or var(), so these read the compiled text.
// Relative to the repo root, where Vitest runs.
const hub = compile("src/pages/hubPage/hubPage.scss").css;
const toasts = compile("src/components/statusBar/statusBar.scss").css;
const dashboard = compile("src/pages/hubPage/components/views/dashboard.scss").css;
const chat = compile("src/pages/hubPage/components/views/aiAssistant.scss").css;
const settings = compile("src/pages/hubPage/components/views/settings.scss").css;
const tour = compile("src/pages/hubPage/components/dialogs/tourOverlay.scss").css;
const confirmDialog = compile("src/components/confirmModal/confirmDialog.scss").css;

describe("bottom nav layout", () => {
  it("publishes its height only while it is on screen", () => {
    expect(hub).toMatch(/:root:has\(\.bottom-nav\) \{\s*--bottom-nav-height: 56px/);
    expect(hub).not.toMatch(/(^|\n):root \{[^}]*--bottom-nav-height/);
  });

  it("takes over the bottom safe area from the hub layout", () => {
    expect(hub).toMatch(/\.bottom-nav \{[^}]*padding-bottom: env\(safe-area-inset-bottom\)/);
    expect(hub).toMatch(/\.hub-layout--bottom-nav \{\s*padding-bottom: 0/);
  });

  it("is a 36px line for the demo banner", () => {
    expect(hub).toMatch(/\.demo-banner-toggle \{[^}]*height: 36px/);
  });

  it("lets the workspace shrink, so the open demo banner cannot push it out of view", () => {
    expect(hub).toMatch(/\.demo-banner \{[^}]*flex-shrink: 0/);
    expect(hub).toMatch(/\.hub-body \{[^}]*flex: 1;[^}]*min-height: 0/);
  });

  it("no longer carries the drawer or the bottom sheet", () => {
    expect(hub).not.toMatch(/mobile-drawer|mobile-doc-picker/);
  });
});

describe("toasts", () => {
  it("sit above the bottom nav and the safe area, and fall back to no offset without the nav", () => {
    expect(toasts).toMatch(/\.statusbar \{[^}]*bottom: calc\(24px \+ var\(--bottom-nav-height, 0px\) \+ env\(safe-area-inset-bottom\)\)/);
  });
});

describe("toasts on phones", () => {
  const PHONE = /@media \(max-width: 767px\) \{/.source;

  it("also clear the chat input and the keyboard, only at phone widths", () => {
    expect(toasts).toMatch(new RegExp(`${PHONE}\\s*\\.statusbar \\{\\s*bottom: calc\\(24px \\+ var\\(--bottom-nav-height, 0px\\) \\+ var\\(--chat-input-offset, 0px\\) \\+ var\\(--keyboard-overlap, 0px\\) \\+ env\\(safe-area-inset-bottom\\)\\)`));
  });

  it("count the chat input only while the chat is the visible tab", () => {
    expect(chat).toMatch(/:root:has\(\.hub-keepalive:not\(\.hub-keepalive--hidden\) \.ai-input-section\) \{\s*--chat-input-offset: var\(--chat-input-height, 0px\)/);
  });
});

describe("settings on phones", () => {
  it("leaves the side margins to the view wrapper, keeping 32px elsewhere", () => {
    expect(settings).toMatch(/\.settings-view \{[^}]*padding: 32px/);
    expect(settings).toMatch(/@media \(max-width: 767px\) \{\s*\.settings-view \{\s*padding: 16px 0/);
  });
});

describe("tour on phones", () => {
  it("limits the bubble to the room it was given, minus the safe areas", () => {
    expect(tour).toMatch(/\.tour-callout--phone \{[^}]*max-height: calc\(var\(--tour-room\) - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\)\);[^}]*overflow-y: auto/);
  });

  it("docks a bubble above the bottom nav", () => {
    expect(tour).toMatch(/\.tour-callout--docked \{[^}]*bottom: calc\(16px \+ var\(--bottom-nav-height, 0px\) \+ env\(safe-area-inset-bottom\)\)/);
  });

  it("keeps the Skip button in the bubble's flow", () => {
    expect(tour).toMatch(/\.tour-callout--phone \.tour-skip \{[^}]*position: static/);
  });

  it("keeps the unsaved-changes dialog above the tour, only at phone widths", () => {
    expect(confirmDialog).toMatch(/\.confirm-overlay \{[^}]*z-index: 1000/);
    expect(confirmDialog).toMatch(/@media \(max-width: 767px\) \{\s*\.confirm-overlay \{\s*z-index: 9100/);
  });
});

describe("recent documents star", () => {
  it("grows to 44px only on touch screens", () => {
    expect(dashboard).toMatch(/@media \(pointer: coarse\) \{[^@]*\.recent-doc-star \{[^}]*min-width: 44px;[^}]*min-height: 44px/);
  });
});
