import { describe, it, expect } from "vitest";
import { citedSources, formatCitations, formatMessageTime } from "../assistantUtils";

const NBSP = "\u00A0";
const m = (n: number) => `\u2066[${n}]\u2069`;

describe("formatCitations", () => {
  const citations = [
    { id: "c1", docId: "d1", title: "Vacation Policy", index: 0 },
    { id: "c2", docId: "d1", title: "Vacation Policy", index: 3 },
    { id: "c3", docId: "d2", title: "Travel Guide", index: 1 },
  ];

  it("replaces chunk ids with document numbers", () => {
    expect(formatCitations("Twenty days [c1]. Book early [c3].", citations)).toBe(
      `Twenty days${NBSP}${m(1)}. Book early${NBSP}${m(2)}.`
    );
  });

  it("numbers each document once when several of its chunks are cited", () => {
    expect(formatCitations("Both [c1, c2, c3].", citations)).toBe(`Both${NBSP}${m(1)}${NBSP}${m(2)}.`);
  });

  it("drops ids that are not in the citations", () => {
    expect(formatCitations("Unknown [c9].", citations)).toBe("Unknown.");
  });

  it("leaves other brackets alone", () => {
    expect(formatCitations("See [note] and [1].", [])).toBe("See [note] and [1].");
  });

  it("gives a document cited again later the same number", () => {
    expect(formatCitations("One [c1]. Two [c3]. Three [c2].", citations)).toBe(
      `One${NBSP}${m(1)}. Two${NBSP}${m(2)}. Three${NBSP}${m(1)}.`
    );
  });

  it("merges citations in a row and separates them from the word before", () => {
    expect(formatCitations("Long[c1][c2][c3].", citations)).toBe(`Long${NBSP}${m(1)}${NBSP}${m(2)}.`);
  });

  it("separates a marker from the word after it", () => {
    expect(formatCitations("Long[c1]and short.", citations)).toBe(`Long${NBSP}${m(1)} and short.`);
  });

  it("moves a marker alone on its line up to the text it cites", () => {
    expect(formatCitations("Twenty days.\n\n[c1]\n\nNext.", citations)).toBe(`Twenty days.${NBSP}${m(1)}\n\nNext.`);
  });

  it("keeps a marker that opens a line of text on that line", () => {
    expect(formatCitations("Intro:\n[c1] Twenty days.", citations)).toBe(`Intro:\n${m(1)} Twenty days.`);
  });

  it("keeps a list item a list item when it opens with a marker", () => {
    expect(formatCitations("- [c1] Twenty days.", citations)).toBe(`- ${m(1)} Twenty days.`);
  });

  it("adds no space before a marker that opens the answer", () => {
    expect(formatCitations("[c1] Twenty days.", citations)).toBe(`${m(1)} Twenty days.`);
  });

  it("keeps the numbers of the valid ids in a list with unknown ones", () => {
    expect(formatCitations("Both [c9, c3].", citations)).toBe(`Both${NBSP}${m(2)}.`);
  });

  it("stays fast on long whitespace around citations", () => {
    const blanks = " ".repeat(100_000);
    const start = performance.now();
    expect(formatCitations(`A${blanks}[c1]${blanks}b${blanks}[note]`, citations)).toContain(m(1));
    expect(performance.now() - start).toBeLessThan(500);
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

describe("formatMessageTime", () => {
  it("formats the stored time", () => {
    const sentAt = new Date(2026, 0, 15, 9, 30).getTime();
    expect(formatMessageTime(sentAt)).toBe(
      new Date(sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  });

  it("returns null for a message saved without a time", () => {
    expect(formatMessageTime(undefined)).toBeNull();
  });
});
