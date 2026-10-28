// @vitest-environment node
import { describe, it, expect } from "vitest";
import { documentSchema } from "../schemas.js";

const MAX_CONTENT = 500000;

function doc(content) {
  return { title: "Title", category: "Category", content };
}

describe("documentSchema content limit", () => {
  it("accepts content at the limit", () => {
    expect(documentSchema.safeParse(doc("x".repeat(MAX_CONTENT))).success).toBe(true);
  });

  it("rejects content over the limit with a clear message", () => {
    const result = documentSchema.safeParse(doc("x".repeat(MAX_CONTENT + 1)));

    expect(result.success).toBe(false);
    expect(result.error.issues).toEqual([
      expect.objectContaining({ path: ["content"], message: "Content must be at most 500,000 characters" }),
    ]);
  });
});
