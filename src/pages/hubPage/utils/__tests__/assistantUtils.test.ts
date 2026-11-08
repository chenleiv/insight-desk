import { describe, it, expect } from "vitest";
import { citedSources, formatMessageTime, removeCitations } from "../assistantUtils";

describe("removeCitations", () => {
  it("removes citations and the space in front of them", () => {
    expect(removeCitations("Twenty days [c1]. Book early [c3].")).toBe("Twenty days. Book early.");
  });

  it("removes a list of citations", () => {
    expect(removeCitations("Both [c1, c2, c3].")).toBe("Both.");
  });

  it("removes an unknown citation too", () => {
    expect(removeCitations("Unknown [c9].")).toBe("Unknown.");
  });

  it("leaves other brackets alone", () => {
    expect(removeCitations("See [note] and [1].")).toBe("See [note] and [1].");
  });

  it("removes a citation before a period", () => {
    expect(removeCitations("14 characters[c1].")).toBe("14 characters.");
  });

  it("removes a citation after a period", () => {
    expect(removeCitations("14 characters. [c1]")).toBe("14 characters.");
    expect(removeCitations("14 characters.[c1]")).toBe("14 characters.");
    expect(removeCitations("One. [c1] Two.")).toBe("One. Two.");
  });

  it("removes a citation on its own line, with the line break in front of it", () => {
    expect(removeCitations("Twenty days.\n[c1]")).toBe("Twenty days.");
    expect(removeCitations("Twenty days.\n\n[c1]\n\nNext.")).toBe("Twenty days.\n\nNext.");
  });

  it("removes several citations in a row", () => {
    expect(removeCitations("14 characters [c1][c2].")).toBe("14 characters.");
    expect(removeCitations("14 characters [c1] [c2, c3] .")).toBe("14 characters.");
  });

  it("keeps the words around a citation apart", () => {
    expect(removeCitations("Long[c1]and short.")).toBe("Long and short.");
    expect(removeCitations("Long [c1] and short.")).toBe("Long and short.");
  });

  it("keeps the punctuation after a citation next to the word before it", () => {
    expect(removeCitations("One [c1], two [c2] (three [c3]).")).toBe("One, two (three).");
  });

  it("keeps the line when a citation opens a line of text", () => {
    expect(removeCitations("Intro:\n[c1] Twenty days.")).toBe("Intro:\nTwenty days.");
    expect(removeCitations("[c1] Twenty days.")).toBe("Twenty days.");
  });

  it("keeps a list item a list item", () => {
    expect(removeCitations("- [c1] Twenty days.\n- Book early [c3].")).toBe("- Twenty days.\n- Book early.");
  });

  it("keeps bold closed around a citation", () => {
    expect(removeCitations("**Twenty days [c1]** a year.")).toBe("**Twenty days** a year.");
  });

  it("removes citations in a right-to-left answer and keeps its words apart", () => {
    const word = "\u05d9\u05de\u05d9\u05dd";
    expect(removeCitations(`${word} [c1].\n[c2]`)).toBe(`${word}.`);
    expect(removeCitations(`${word}[c1]${word}.`)).toBe(`${word} ${word}.`);
  });

  it("stays fast on long whitespace around citations", () => {
    const blanks = " ".repeat(100_000);
    const start = performance.now();
    expect(removeCitations(`A${blanks}[c1]${blanks}b${blanks}[note]`)).not.toContain("c1");
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
