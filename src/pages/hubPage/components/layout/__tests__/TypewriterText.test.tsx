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
const render = (text: string, onComplete?: () => void) =>
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
});
