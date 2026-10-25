// @vitest-environment node
import { describe, it, expect } from "vitest";
import { chunkText } from "../chunker.js";

const SENTENCES = [
  "Employees accrue vacation days monthly.",
  "Unused days roll over to the next year.",
  "Requests must be approved by a manager.",
  "Remote work is allowed two days a week.",
  "Equipment is provided by the IT team.",
  "Expenses need a receipt within 30 days.",
  "Security training is mandatory each year.",
  "Badges must be worn inside the office.",
  "Parking passes are issued by facilities.",
  "Questions go to the HR help desk.",
];
const LONG_TEXT = SENTENCES.join(" ");

describe("chunkText", () => {
  it("returns an empty array for empty or whitespace-only text", () => {
    expect(chunkText("", 200, 50)).toEqual([]);
    expect(chunkText("   \n\t ", 200, 50)).toEqual([]);
  });

  it("returns a single chunk equal to the text when it is shorter than size", () => {
    const text = "A short policy note. It fits in one chunk.";
    expect(chunkText(text, 200, 50)).toEqual([text]);
  });

  it("splits long text into chunks no longer than size, with overlap", () => {
    const chunks = chunkText(LONG_TEXT, 120, 50);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(120);
    }
    // Each chunk starts with a sentence carried over from the previous chunk.
    for (let i = 1; i < chunks.length; i++) {
      const firstSentence = chunks[i].match(/^.*?[.!?]/)[0];
      expect(chunks[i - 1]).toContain(firstSentence);
    }
  });

  it("does not lose any sentence", () => {
    const chunks = chunkText(LONG_TEXT, 120, 50);

    for (const sentence of SENTENCES) {
      expect(chunks.some((chunk) => chunk.includes(sentence))).toBe(true);
    }
  });

  it("splits a sentence longer than size without exceeding size", () => {
    const longSentence = "word ".repeat(60).trim() + ".";
    const chunks = chunkText(longSentence, 50, 10);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
    }
    expect(chunks[0].startsWith("word")).toBe(true);
    expect(chunks.at(-1).endsWith(".")).toBe(true);
  });

  it("throws on invalid size or overlap", () => {
    expect(() => chunkText("text", 0, 0)).toThrow();
    expect(() => chunkText("text", 100, -1)).toThrow();
    expect(() => chunkText("text", 100, 100)).toThrow();
  });
});
