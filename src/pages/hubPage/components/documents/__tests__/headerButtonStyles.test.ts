import { describe, it, expect, beforeAll } from "vitest";
import { compile } from "sass";

// jsdom does not run the cascade on SCSS, so these tests read the compiled rules instead.
// They check the rules exist with the shared tokens and in the right order; the look itself
// still needs a browser.
// Relative to the repo root, where Vitest runs.
const SCSS = "src/pages/hubPage/components/documents/docPane.scss";

const ACTIONS = ".doc-pane .doc-pane-actions";
let rules: CSSStyleRule[];
let compiledCss: string;

function flatten(list: CSSRuleList): CSSStyleRule[] {
  return [...list].flatMap((rule) =>
    rule instanceof CSSStyleRule ? [rule] : "cssRules" in rule ? flatten((rule as CSSGroupingRule).cssRules) : [],
  );
}

function ruleIndex(selector: string) {
  const index = rules.findIndex((r) => r.selectorText.split(",").map((s) => s.trim()).includes(selector));
  expect(index, selector).toBeGreaterThanOrEqual(0);
  return index;
}

const rule = (selector: string) => rules[ruleIndex(selector)]!.style;

// jsdom drops !important from values that use var(), so the priority is read from the
// compiled text of the one rule with this selector.
function ruleBody(selector: string) {
  for (const [, selectors, body] of compiledCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors!.split(",").map((s) => s.trim()).includes(selector)) return body!;
  }
  throw new Error(`No compiled rule for selector: ${selector}`);
}

function declaration(body: string, property: string) {
  const match = body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`));
  if (!match) throw new Error(`No ${property} declaration in rule`);
  return match[1]!.trim();
}

beforeAll(() => {
  const style = document.createElement("style");
  compiledCss = compile(SCSS).css;
  style.textContent = compiledCss;
  document.head.appendChild(style);
  rules = flatten(style.sheet!.cssRules);
});

describe("header action button styles", () => {
  it("gives the normal state one color, background and border from the theme tokens", () => {
    const resting = rule(`${ACTIONS} .doc-pane-header-btn`);
    expect(resting.getPropertyValue("color")).toBe("var(--text)");
    expect(resting.getPropertyValue("background")).toBe("var(--soft)");
    expect(resting.getPropertyValue("border")).toBe("1px solid var(--border)");
  });

  it("comes after the general icon button rule, so its muted color does not win", () => {
    expect(ruleIndex(`${ACTIONS} .doc-pane-header-btn`)).toBeGreaterThan(ruleIndex(`${ACTIONS} .icon-btn`));
  });

  it("keeps a different look for the disabled state", () => {
    const resting = rule(`${ACTIONS} .doc-pane-header-btn`);
    const disabled = rule(`${ACTIONS} .doc-pane-header-btn:disabled`);
    expect(disabled.getPropertyValue("background")).toBe("var(--panel)");
    expect(disabled.getPropertyValue("color")).toBe("var(--muted)");
    expect(disabled.getPropertyValue("opacity")).toBe("0.5");
    expect(disabled.getPropertyValue("background")).not.toBe(resting.getPropertyValue("background"));
    expect(disabled.getPropertyValue("color")).not.toBe(resting.getPropertyValue("color"));
  });

  it("gives Edit, the icon buttons, Delete and Close one height", () => {
    const heights = [
      rule(".doc-pane-mode-btn"),
      rule(`${ACTIONS} .doc-pane-header-tool-btn`),
      rule(".doc-pane .doc-pane-delete-btn"),
      rule(`${ACTIONS} .doc-pane-close-btn`),
    ].map((s) => s.getPropertyValue("height"));
    expect(heights).toEqual(["36px", "36px", "36px", "36px"]);
  });

  it("gives Delete the red hover, at the same weight as the general hover rule", () => {
    const selector = `${ACTIONS} .icon-btn.doc-pane-delete-btn:hover:not(:disabled)`;
    const hover = rule(selector);
    expect(hover.getPropertyValue("color")).toBe("var(--danger-text)");
    expect(hover.getPropertyValue("background")).toBe("var(--danger-bg)");
    expect(hover.getPropertyValue("border-color")).toBe("var(--danger-border)");
    const body = ruleBody(selector);
    expect(declaration(body, "background")).toBe("var(--danger-bg) !important");
    expect(declaration(body, "border-color")).toBe("var(--danger-border) !important");
  });
});
