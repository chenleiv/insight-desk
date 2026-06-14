import { describe, it, expect } from "vitest";
import { toInput, emptyInput, isSameInput, isInputValid } from "../documentForm";
import type { DocumentItem } from "../../../../api/documentsClient";

const fullDoc: DocumentItem = {
  id: "1",
  title: "My Title",
  category: "policy",
  content: "Some content here",
};

describe("toInput", () => {
  it("extracts title, category, content from a document", () => {
    expect(toInput(fullDoc)).toEqual({
      title: "My Title",
      category: "policy",
      content: "Some content here",
    });
  });

  it("falls back to empty string for missing fields", () => {
    const doc = { id: "1" } as unknown as DocumentItem;
    expect(toInput(doc)).toEqual({ title: "", category: "", content: "" });
  });
});

describe("emptyInput", () => {
  it("returns all fields as empty string", () => {
    expect(emptyInput()).toEqual({ title: "", category: "", content: "" });
  });
});

describe("isSameInput", () => {
  it("returns true for identical inputs", () => {
    const a = toInput(fullDoc);
    const b = toInput(fullDoc);
    expect(isSameInput(a, b)).toBe(true);
  });

  it("returns true when values are equal after trimming", () => {
    expect(isSameInput(
      { title: "Hello ", category: "x", content: "y" },
      { title: "Hello", category: "x", content: "y" },
    )).toBe(true);
  });

  it("returns false when a field differs", () => {
    expect(isSameInput(
      { title: "A", category: "x", content: "y" },
      { title: "B", category: "x", content: "y" },
    )).toBe(false);
  });
});

describe("isInputValid", () => {
  it("returns true when all fields are non-empty", () => {
    expect(isInputValid({ title: "T", category: "C", content: "Body" })).toBe(true);
  });

  it("returns false when any field is empty", () => {
    expect(isInputValid({ title: "", category: "C", content: "Body" })).toBe(false);
    expect(isInputValid({ title: "T", category: "", content: "Body" })).toBe(false);
    expect(isInputValid({ title: "T", category: "C", content: "" })).toBe(false);
  });

  it("returns false when a field is whitespace-only", () => {
    expect(isInputValid({ title: "  ", category: "C", content: "Body" })).toBe(false);
  });
});
