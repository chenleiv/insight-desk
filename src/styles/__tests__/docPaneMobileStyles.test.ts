import { describe, it, expect } from "vitest";
import { compile } from "sass";

// jsdom has no layout, so these tests read the compiled rules. Real sizes and the on-screen
// keyboard still need a browser and a phone.
// Relative to the repo root, where Vitest runs.
const DOCS = "src/pages/hubPage/components/documents";

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

describe("document pane touch targets", () => {
  it.each([
    [`${DOCS}/notionEditor.scss`, ".notion-title-input"],
    [`${DOCS}/notionEditor.scss`, ".notion-category-input"],
    [`${DOCS}/notionEditor.scss`, ".doc-pane-import-btn"],
    [`${DOCS}/docPane.scss`, ".doc-pane-back"],
    [`${DOCS}/docPane.scss`, ".doc-pane-header-btn"],
    [`${DOCS}/docPane.scss`, ".doc-pane-mode-btn"],
    [`${DOCS}/docPane.scss`, ".doc-pane-cancel-btn"],
  ])("%s %s is at least 44px on touch", (path, selector) => {
    const rule = mediaRules(sheet(path).cssRules, "pointer: coarse")
      .find((r) => r.selectorText.split(",").some((s) => s.trim().endsWith(selector)));
    expect(rule?.style.getPropertyValue("min-width"), selector).toBe("44px");
    expect(rule?.style.getPropertyValue("min-height"), selector).toBe("44px");
  });

  it("wins over the fixed 36px minimum of Delete and Close", () => {
    const css = compile(`${DOCS}/docPane.scss`).css;
    const close = css.indexOf(".doc-pane .doc-pane-actions .doc-pane-close-btn {");
    const touch = css.search(/@media \(pointer: coarse\) \{\s*\.doc-pane \.doc-pane-actions \.doc-pane-header-btn/);
    expect(close).toBeGreaterThanOrEqual(0);
    expect(touch).toBeGreaterThan(close);
  });
});

describe("create form action bar", () => {
  const rules = () => [...sheet(`${DOCS}/docPane.scss`).cssRules];

  it("has room for its 44px buttons on touch, without changing the desktop bar", () => {
    const selector = ".doc-pane-save-bar.doc-pane-save-bar--visible";
    const touch = mediaRules(sheet(`${DOCS}/docPane.scss`).cssRules, "pointer: coarse")
      .find((r) => r.selectorText === selector);
    expect(touch?.style.getPropertyValue("max-height")).toBe("65px");
    const base = rules().filter((r): r is CSSStyleRule => r instanceof CSSStyleRule).find((r) => r.selectorText === selector);
    expect(base?.style.getPropertyValue("max-height")).toBe("60px");
  });

  it("stays in the page flow, so it sits above the bottom nav and the keyboard", () => {
    const base = rules().filter((r): r is CSSStyleRule => r instanceof CSSStyleRule)
      .find((r) => r.selectorText === ".doc-pane-save-bar");
    expect(base?.style.getPropertyValue("position")).toBe("");
    expect(base?.style.getPropertyValue("flex-shrink")).toBe("0");
  });
});

describe("document pane header on a narrow phone", () => {
  it("lets the status shrink instead of pushing the buttons off screen, on phones only", () => {
    const phone = mediaRules(sheet(`${DOCS}/docPane.scss`).cssRules, "max-width: 767px");
    const actions = phone.find((r) => r.selectorText === ".doc-pane .doc-pane-actions");
    const status = phone.find((r) => r.selectorText === ".doc-pane .doc-pane-actions .doc-pane-save-status");
    const buttons = phone.find((r) => r.selectorText === ".doc-pane .doc-pane-actions > button");
    expect(actions?.style.getPropertyValue("flex-shrink")).toBe("1");
    expect(status?.style.getPropertyValue("text-overflow")).toBe("ellipsis");
    expect(buttons?.style.getPropertyValue("flex-shrink")).toBe("0");
  });
});
