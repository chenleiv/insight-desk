import { describe, it, expect } from "vitest";
import { compile } from "sass";
import html from "../../../index.html?raw";

// jsdom has no layout, so these tests read the compiled rules. Real sizes and the on-screen
// keyboard still need a browser and a phone.
// Relative to the repo root, where Vitest runs.
const VIEWS = "src/pages/hubPage/components/views";
const DOCS = "src/pages/hubPage/components/documents";
const DIALOGS = "src/pages/hubPage/components/dialogs";

function sheet(path: string) {
  const style = document.createElement("style");
  style.textContent = compile(path).css;
  document.head.appendChild(style);
  return style.sheet!;
}

function mediaRules(list: CSSRuleList, condition: string): CSSStyleRule[] {
  return [...list].flatMap((rule) => {
    if (rule instanceof CSSMediaRule && rule.conditionText.includes(condition)) {
      return [...rule.cssRules].filter((r): r is CSSStyleRule => r instanceof CSSStyleRule);
    }
    return [];
  });
}

function styleRules(list: CSSRuleList): CSSStyleRule[] {
  return [...list].filter((r): r is CSSStyleRule => r instanceof CSSStyleRule);
}

describe("viewport meta", () => {
  const content = /<meta name="viewport" content="([^"]+)"/.exec(html)?.[1] ?? "";

  it("covers the notch and resizes the layout for the keyboard", () => {
    expect(content).toContain("viewport-fit=cover");
    expect(content).toContain("interactive-widget=resizes-content");
  });

  it("keeps pinch zoom available", () => {
    expect(content).not.toMatch(/maximum-scale|user-scalable/);
  });
});

describe("fields on touch screens", () => {
  it("are at least 16px so iOS does not zoom on focus, except the larger title", () => {
    const rule = mediaRules(sheet("src/styles/globals.scss").cssRules, "pointer: coarse")
      .find((r) => r.selectorText.includes("textarea"));
    expect(rule?.style.getPropertyValue("font-size")).toBe("16px");
    expect(rule?.style.getPropertyPriority("font-size")).toBe("important");
    expect(rule?.selectorText).toContain(":not(.notion-title-input)");
    expect(rule?.selectorText).toContain("select");
  });

  it("keep the category sizer as large as its input", () => {
    const rule = mediaRules(sheet(`${DOCS}/notionEditor.scss`).cssRules, "pointer: coarse")
      .find((r) => r.selectorText === ".notion-category-wrapper::after");
    expect(rule?.style.getPropertyValue("font-size")).toBe("16px");
  });
});

describe("tooltips", () => {
  const { cssRules } = sheet("src/styles/globals.scss");

  it("open on hover only where a pointer can hover", () => {
    const outside = styleRules(cssRules).filter((r) => r.selectorText.includes(":hover"));
    expect(outside.filter((r) => r.selectorText.includes("[data-tooltip]"))).toEqual([]);
    const inside = mediaRules(cssRules, "hover: hover").map((r) => r.selectorText).join(",");
    expect(inside).toContain('[data-tooltip][data-tooltip-pos=bottom]:hover::after');
    expect(inside).toContain('[data-tooltip][data-tooltip-pos=left]:hover::after');
  });

  it("do not exist on touch, so they cannot stick or overflow", () => {
    const rule = mediaRules(cssRules, "hover: none").find((r) => r.selectorText.includes("[data-tooltip]::after"));
    expect(rule?.style.getPropertyValue("display")).toBe("none");
  });
});

describe("touch targets", () => {
  it.each([
    ["src/pages/hubPage/hubPage.scss", ".topbar-icon-btn"],
    ["src/pages/hubPage/hubPage.scss", ".brainy-fab"],
    [`${DOCS}/docPanel.scss`, ".doc-panel-row-star-btn"],
    [`${DOCS}/docPanel.scss`, ".doc-panel-star-btn"],
    [`${DOCS}/notionEditor.scss`, ".notion-att-chip-action"],
    [`${VIEWS}/aiAssistant.scss`, ".ai-send-btn"],
    [`${VIEWS}/aiAssistant.scss`, ".ai-message-feedback button"],
    [`${VIEWS}/aiAssistant.scss`, ".ai-message-sources button"],
    [`${VIEWS}/quality.scss`, ".quality-range-btn"],
    [`${VIEWS}/settings.scss`, ".settings-tab"],
    [`${VIEWS}/dashboard.scss`, ".action-btn"],
    [`${DIALOGS}/tourOverlay.scss`, ".tour-btn"],
    [`${DIALOGS}/welcomeModal.scss`, ".welcome-close"],
    ["src/pages/loginPage/loginPage.scss", ".eye-btn"],
    ["src/components/statusBar/statusBar.scss", ".statusbar-close"],
    ["src/components/menu/menu.scss", ".menu-item"],
    ["src/styles/layout.scss", ".primary-btn"],
    ["src/styles/layout.scss", ".secondary-btn"],
    ["src/styles/layout.scss", ".danger-btn"],
  ])("%s %s is at least 44px on touch", (path, selector) => {
    const rule = mediaRules(sheet(path).cssRules, "pointer: coarse")
      .find((r) => r.selectorText.split(",").some((s) => s.trim().endsWith(selector)));
    expect(rule?.style.getPropertyValue("min-width"), selector).toBe("44px");
    expect(rule?.style.getPropertyValue("min-height"), selector).toBe("44px");
  });
});

describe("chat answers", () => {
  it.each([".ai-bubble", ".ai-message-sources"])("%s cannot grow wider than its message", (selector) => {
    const rule = styleRules(sheet(`${VIEWS}/aiAssistant.scss`).cssRules).find((r) => r.selectorText === selector);
    expect(rule?.style.getPropertyValue("max-width")).toBe("100%");
  });
});

describe("dashboard actions", () => {
  it("wrap instead of pushing the last button off a narrow screen", () => {
    const rule = styleRules(sheet(`${VIEWS}/dashboard.scss`).cssRules)
      .find((r) => r.selectorText.endsWith(".dashboard-top-actions"));
    expect(rule?.style.getPropertyValue("flex-wrap")).toBe("wrap");
    expect(rule?.style.getPropertyValue("max-width")).toBe("100%");
  });
});

describe("hub layout height", () => {
  // jsdom drops values that use env() or var(), so these read the compiled text.
  const css = compile("src/pages/hubPage/hubPage.scss").css;

  it("follows the visible area instead of the full layout viewport", () => {
    expect(css).toMatch(/\.hub-layout \{[^}]*height: var\(--app-height, 100dvh\)/);
    expect(css).toMatch(/\.hub-layout \{[^}]*top: var\(--app-top, 0\)/);
  });

  it("keeps content out of the safe areas", () => {
    expect(css).toMatch(/\.hub-layout \{[^}]*padding: env\(safe-area-inset-top\) env\(safe-area-inset-right\) env\(safe-area-inset-bottom\) env\(safe-area-inset-left\)/);
  });
});
