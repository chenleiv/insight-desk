import { describe, it, expect } from "vitest";
import { compile } from "sass";

// jsdom has no layout and drops values that use env() or var(), so these read the compiled text.
// Relative to the repo root, where Vitest runs.
const hub = compile("src/pages/hubPage/hubPage.scss").css;
const toasts = compile("src/components/statusBar/statusBar.scss").css;
const dashboard = compile("src/pages/hubPage/components/views/dashboard.scss").css;

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

describe("recent documents star", () => {
  it("grows to 44px only on touch screens", () => {
    expect(dashboard).toMatch(/@media \(pointer: coarse\) \{[^@]*\.recent-doc-star \{[^}]*min-width: 44px;[^}]*min-height: 44px/);
  });
});
