import { describe, it, expect } from "vitest";
import { buildSnippet } from "../assistantUtils";

describe("buildSnippet", () => {
  it("returns empty string for empty content", () => {
    expect(buildSnippet("", "query")).toBe("");
  });

  it("returns first 160 chars with ellipsis when content is long and no query", () => {
    const long = "x".repeat(200);
    const result = buildSnippet(long, "");
    expect(result).toBe("x".repeat(160) + "…");
  });

  it("returns full content without ellipsis when content is short and no query", () => {
    expect(buildSnippet("short", "")).toBe("short");
  });

  it("returns snippet that contains the query match", () => {
    const content = "a".repeat(100) + "hello" + "b".repeat(100);
    const result = buildSnippet(content, "hello");
    expect(result).toContain("hello");
  });

  it("falls back to first 160 chars when query not found in content", () => {
    const content = "a".repeat(200);
    const result = buildSnippet(content, "notfound");
    expect(result).toBe("a".repeat(160) + "…");
  });

  it("normalises internal whitespace", () => {
    const result = buildSnippet("hello   world", "world");
    expect(result).toContain("hello world");
  });
});
