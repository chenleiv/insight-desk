import { describe, it, expect } from "vitest";
import { buildSnippet, citedSources, formatCitations } from "../assistantUtils";

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

describe("formatCitations", () => {
  const citations = [
    { id: "c1", docId: "d1", title: "Vacation Policy", index: 0 },
    { id: "c2", docId: "d1", title: "Vacation Policy", index: 3 },
    { id: "c3", docId: "d2", title: "Travel Guide", index: 1 },
  ];

  it("replaces chunk ids with document titles", () => {
    expect(formatCitations("Twenty days [c1]. Book early [c3].", citations)).toBe(
      "Twenty days [Vacation Policy]. Book early [Travel Guide]."
    );
  });

  it("lists each document once when several of its chunks are cited", () => {
    expect(formatCitations("Both [c1, c2, c3].", citations)).toBe("Both [Vacation Policy, Travel Guide].");
  });

  it("drops ids that are not in the citations", () => {
    expect(formatCitations("Unknown [c9].", citations)).toBe("Unknown.");
  });

  it("leaves other brackets alone", () => {
    expect(formatCitations("See [note] and [1].", [])).toBe("See [note] and [1].");
  });
});

describe("citedSources", () => {
  it("lists each cited document once, in order of first citation", () => {
    const citations = [
      { id: "c2", docId: "d2", title: "Travel Guide", index: 1 },
      { id: "c1", docId: "d1", title: "Vacation Policy", index: 0 },
      { id: "c3", docId: "d2", title: "Travel Guide", index: 4 },
    ];
    expect(citedSources(citations)).toEqual([
      { id: "d2", title: "Travel Guide" },
      { id: "d1", title: "Vacation Policy" },
    ]);
  });

  it("returns no sources when nothing is cited", () => {
    expect(citedSources([])).toEqual([]);
  });
});
