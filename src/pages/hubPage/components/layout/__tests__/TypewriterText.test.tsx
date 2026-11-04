import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import TypewriterText from "../TypewriterText";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const shown = () => container.querySelector(".typewriter")?.textContent ?? "";
const hasCursor = () => container.querySelector(".typewriter-cursor") !== null;
const render = (text: string, onComplete: () => void = () => {}) =>
  act(() => root.render(<TypewriterText text={text} speed={10} onComplete={onComplete} />));
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("TypewriterText", () => {
  it("types the text one letter per tick, then hides the cursor and calls onComplete once", () => {
    const onComplete = vi.fn();
    render("abc", onComplete);
    expect(shown()).toBe("");
    expect(hasCursor()).toBe(true);

    tick(10);
    expect(shown()).toBe("a");
    tick(20);
    expect(shown()).toBe("abc");
    expect(hasCursor()).toBe(false);

    tick(100);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("restarts from the beginning when the text changes", () => {
    render("hello");
    tick(30);
    expect(shown()).toBe("hel");

    render("xyz");
    expect(shown()).toBe("");
    tick(10);
    expect(shown()).toBe("x");
  });

  describe("long answers", () => {
    const ANSWER = "word ".repeat(600);
    const renderAnswer = (onComplete: () => void = () => {}) => {
      const parse = vi.fn((typed: string) => typed);
      act(() => root.render(<TypewriterText text={ANSWER} render={parse} onComplete={onComplete} />));
      return parse;
    };

    it("finishes a 3,000 character answer within 4 seconds", () => {
      const onComplete = vi.fn();
      renderAnswer(onComplete);

      tick(3900);
      expect(shown().length).toBeLessThan(ANSWER.length);
      expect(onComplete).not.toHaveBeenCalled();

      tick(100);
      expect(shown()).toBe(ANSWER);
      expect(hasCursor()).toBe(false);
      expect(onComplete).toHaveBeenCalledOnce();
    });

    it("parses the answer far fewer times than it has characters", () => {
      const parse = renderAnswer();
      tick(4000);

      expect(parse.mock.calls.length).toBeLessThanOrEqual(140);
    });

    it("moves forward at every update, so it does not look stuck", () => {
      renderAnswer();

      for (let elapsed = 0, before = 0; elapsed < 3900; elapsed += 300) {
        tick(300);
        expect(shown().length).toBeGreaterThan(before);
        before = shown().length;
      }
    });

    it("holds the limit in a background tab, where timers fire late", () => {
      const onComplete = vi.fn();
      renderAnswer(onComplete);

      vi.setSystemTime(Date.now() + 60_000);
      tick(30);

      expect(shown()).toBe(ANSWER);
      expect(onComplete).toHaveBeenCalledOnce();
    });
  });

  it("types a short answer at the same pace as before", () => {
    const text = "x".repeat(100);
    act(() => root.render(<TypewriterText text={text} />));

    tick(1470);
    expect(shown().length).toBeLessThan(100);
    tick(30);
    expect(shown()).toBe(text);
  });

  it("does not cut an emoji in half", () => {
    render("\u{1F600}\u{1F601}");

    tick(10);
    expect(shown()).toBe("\u{1F600}");
    tick(10);
    expect(shown()).toBe("\u{1F600}");
    tick(10);
    expect(shown()).toBe("\u{1F600}\u{1F601}");
  });

  describe("with reduced motion", () => {
    const matchMedia = (reduced: boolean) =>
      vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query === "(prefers-reduced-motion: reduce)" }));

    afterEach(() => vi.unstubAllGlobals());

    it("shows the whole answer at once, without a cursor, and completes once", () => {
      matchMedia(true);
      const onComplete = vi.fn();
      render("hello", onComplete);

      expect(shown()).toBe("hello");
      expect(hasCursor()).toBe(false);
      expect(onComplete).toHaveBeenCalledOnce();

      tick(1000);
      expect(onComplete).toHaveBeenCalledOnce();
    });

    it("still types when reduced motion is not asked for", () => {
      matchMedia(false);
      render("hello");

      expect(shown()).toBe("");
    });
  });
});
