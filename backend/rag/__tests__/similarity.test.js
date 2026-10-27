// @vitest-environment node
import { describe, it, expect } from "vitest";
import { cosineSimilarity } from "../similarity.js";

describe("cosineSimilarity", () => {
  it("scores [3,4] vs [4,3] as 24/25", () => {
    // dot = 3*4 + 4*3 = 24; |a| = |b| = sqrt(9 + 16) = 5; 24 / (5 * 5) = 0.96
    expect(cosineSimilarity([3, 4], [4, 3])).toBeCloseTo(0.96);
  });

  it("scores perpendicular vectors as 0", () => {
    // dot = 1*0 + 0*1 = 0
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("scores opposite vectors as -1", () => {
    // dot = -1 - 4 = -5; |a| = |b| = sqrt(5); -5 / 5 = -1
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1);
  });

  it("ignores length: a vector and its double score 1", () => {
    // dot = 2 + 8 + 18 = 28; |a| = sqrt(14), |b| = sqrt(56) = 2*sqrt(14); 28 / 28 = 1
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
  });

  it("returns 0 for a zero vector instead of dividing by zero", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it("throws when the lengths differ", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow("Vector lengths differ");
  });
});
