import { describe, it, expect } from "vitest";
import { buildSnippet, scoreDoc } from "../assistantUtils";
import type { DocumentItem } from "../../../../api/documentsClient";

function doc(overrides: Partial<DocumentItem> = {}): DocumentItem {
  return { id: "1", title: "", category: "", content: "", ...overrides };
}

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

describe("scoreDoc", () => {
  it("returns 0 for empty query", () => {
    expect(scoreDoc(doc({ title: "test" }), "")).toBe(0);
  });

  it("returns 0 when all query tokens are shorter than 2 chars", () => {
    expect(scoreDoc(doc({ title: "test" }), "a")).toBe(0);
  });

  it("scores title matches at 6 per token", () => {
    const d = doc({ title: "security policy" });
    const score = scoreDoc(d, "security");
    expect(score).toBeGreaterThanOrEqual(6);
  });

  it("scores category matches at 3 per token", () => {
    const d = doc({ category: "compliance" });
    const score = scoreDoc(d, "compliance");
    expect(score).toBeGreaterThanOrEqual(3);
  });

  it("scores content matches at 2 per token", () => {
    const d = doc({ content: "this is about security" });
    const score = scoreDoc(d, "security");
    expect(score).toBeGreaterThanOrEqual(2);
  });

  it("gives higher score to title match than content match", () => {
    const titleDoc = doc({ title: "security" });
    const contentDoc = doc({ content: "security" });
    expect(scoreDoc(titleDoc, "security")).toBeGreaterThan(scoreDoc(contentDoc, "security"));
  });

  it("returns 0 for a doc with no matching fields", () => {
    const d = doc({ title: "unrelated", category: "other", content: "nothing here" });
    expect(scoreDoc(d, "quantum computing")).toBe(0);
  });
});
