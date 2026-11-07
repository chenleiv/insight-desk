import { describe, it, expect } from "vitest";
import type { DocumentItem } from "../../../../api/documentsClient";
import { MAX_TITLE_LENGTH, documentQuestions, questionTitle } from "../suggestedQuestions";

const doc = (title: string, createdAt?: string): DocumentItem => ({ id: title, title, category: "", content: "", ...(createdAt && { createdAt }) });

describe("questionTitle", () => {
  it("keeps a short title as it is", () => {
    expect(questionTitle("Insight Security Employee Handbook")).toBe("Insight Security Employee Handbook");
  });

  it("cuts a long title at a word and marks the cut", () => {
    const title = questionTitle("Organizational Information Security Policy for Remote and Hybrid Teams");
    expect(title).toBe("Organizational Information Security Policy for…");
    expect(title.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH + 1);
  });

  it("cuts a long title with no spaces at the limit", () => {
    expect(questionTitle("x".repeat(80))).toBe(`${"x".repeat(MAX_TITLE_LENGTH)}…`);
  });

  it("does not leave punctuation before the cut", () => {
    expect(questionTitle("Data Privacy, GDPR and CCPA, Retention, Deletion, Requests")).toBe("Data Privacy, GDPR and CCPA, Retention, Deletion…");
  });

  it("puts a title on one line", () => {
    expect(questionTitle("  Release\n\tnotes  ")).toBe("Release notes");
  });

  it("drops the title's own outer quotes", () => {
    expect(questionTitle('"Quoted title"')).toBe("Quoted title");
    expect(questionTitle("“Quoted title”")).toBe("Quoted title");
  });

  it("keeps quotes and special characters inside the title", () => {
    expect(questionTitle('The "Big" Plan <v2> & co.')).toBe('The "Big" Plan <v2> & co.');
  });
});

describe("documentQuestions", () => {
  const docs = [
    doc("Oldest", "2026-01-01T00:00:00Z"),
    doc("Newest", "2026-03-01T00:00:00Z"),
    doc("Middle", "2026-02-01T00:00:00Z"),
  ];

  it("asks about the newest documents first, each in its own wording", () => {
    expect(documentQuestions(docs)).toEqual([
      "What is “Newest” about?",
      "What are the key points of “Middle”?",
      "What are the most important rules in “Oldest”?",
    ]);
  });

  it("stops at the count", () => {
    expect(documentQuestions(docs, 2)).toHaveLength(2);
  });

  it("asks at most four questions", () => {
    const many = Array.from({ length: 10 }, (_, i) => doc(`Doc ${i}`));
    expect(documentQuestions(many, 10)).toHaveLength(4);
  });

  it("puts documents without a date last", () => {
    expect(documentQuestions([doc("Undated"), ...docs])[3]).toBe("What should I know first from “Undated”?");
  });

  it("skips empty titles and asks about a title only once", () => {
    expect(documentQuestions([doc("  "), doc("Same"), doc("Same ")])).toEqual(["What is “Same” about?"]);
  });

  it("keeps a title with quotes readable inside the question", () => {
    expect(documentQuestions([doc('The "Big" Plan')])).toEqual(["What is “The \"Big\" Plan” about?"]);
  });

  it("asks nothing for an empty library", () => {
    expect(documentQuestions([])).toEqual([]);
  });
});
