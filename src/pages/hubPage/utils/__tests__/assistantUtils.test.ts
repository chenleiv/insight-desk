import { describe, it, expect } from "vitest";
import { citedSources, formatCitations } from "../assistantUtils";

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
