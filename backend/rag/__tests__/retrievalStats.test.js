// @vitest-environment node
import { describe, it, expect } from "vitest";
import { summarizeRetrievalLogs, formatSummary } from "../retrievalStats.js";

const log = (scores, noInfo = false) => ({ results: scores.map((score) => ({ score })), noInfo });

describe("summarizeRetrievalLogs", () => {
  it("counts questions, \"no information\" answers and top-score buckets", () => {
    const s = summarizeRetrievalLogs([
      log([0.2, 0.1], true),
      log([0.35, 0.2]),
      log([0.3]),
      log([0.62, 0.5]),
      log([], true),
    ]);

    expect(s.questions).toBe(5);
    expect(s.noInfo).toBe(2);
    expect(s.noResults).toBe(1);
    expect(s.meanTopScore).toBeCloseTo((0.2 + 0.35 + 0.3 + 0.62) / 4);
    expect(s.buckets.map((b) => b.count)).toEqual([1, 2, 0, 0, 1]);
  });

  it("handles no logs", () => {
    const s = summarizeRetrievalLogs([]);

    expect(s).toMatchObject({ questions: 0, noInfo: 0, noResults: 0, meanTopScore: null });
    expect(formatSummary(s)).toContain("| questions | 0 |");
  });
});
