import { describe, it, expect } from "vitest";
import { normalizeOrder, applyOrder, sameArray } from "../ordering";
import type { DocumentItem } from "../../../../api/documentsClient";

function doc(id: string): DocumentItem {
  return { id, title: id, category: "", content: "" };
}

describe("normalizeOrder", () => {
  it("returns all doc ids when order is empty", () => {
    const docs = [doc("a"), doc("b")];
    expect(normalizeOrder([], docs)).toEqual(["a", "b"]);
  });

  it("preserves existing order", () => {
    const docs = [doc("a"), doc("b"), doc("c")];
    expect(normalizeOrder(["c", "a", "b"], docs)).toEqual(["c", "a", "b"]);
  });

  it("prepends new docs before existing order", () => {
    const docs = [doc("a"), doc("b"), doc("c")];
    expect(normalizeOrder(["b", "a"], docs)).toEqual(["c", "b", "a"]);
  });

  it("removes ids for deleted docs", () => {
    const docs = [doc("a"), doc("c")];
    expect(normalizeOrder(["a", "b", "c"], docs)).toEqual(["a", "c"]);
  });

  it("handles empty docs list", () => {
    expect(normalizeOrder(["a", "b"], [])).toEqual([]);
  });
});

describe("applyOrder", () => {
  it("returns docs as-is when order is empty", () => {
    const docs = [doc("a"), doc("b")];
    expect(applyOrder(docs, [])).toEqual(docs);
  });

  it("reorders docs according to order array", () => {
    const docs = [doc("a"), doc("b"), doc("c")];
    const result = applyOrder(docs, ["c", "a", "b"]);
    expect(result.map((d) => d.id)).toEqual(["c", "a", "b"]);
  });

  it("appends docs not in order at the end", () => {
    const docs = [doc("a"), doc("b"), doc("c")];
    const result = applyOrder(docs, ["b"]);
    expect(result.map((d) => d.id)).toEqual(["b", "a", "c"]);
  });

  it("handles order ids that no longer exist in docs", () => {
    const docs = [doc("a"), doc("b")];
    const result = applyOrder(docs, ["x", "b", "a"]);
    expect(result.map((d) => d.id)).toEqual(["b", "a"]);
  });
});

describe("sameArray", () => {
  it("returns true for the same reference", () => {
    const arr = ["a", "b"];
    expect(sameArray(arr, arr)).toBe(true);
  });

  it("returns true for equal arrays", () => {
    expect(sameArray(["a", "b"], ["a", "b"])).toBe(true);
  });

  it("returns false for different lengths", () => {
    expect(sameArray(["a"], ["a", "b"])).toBe(false);
  });

  it("returns false for same length but different contents", () => {
    expect(sameArray(["a", "c"], ["a", "b"])).toBe(false);
  });

  it("returns true for two empty arrays", () => {
    expect(sameArray([], [])).toBe(true);
  });
});
