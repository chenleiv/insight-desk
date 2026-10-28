// @vitest-environment node
import { describe, it, expect } from "vitest";
import { summarizeRetrievalLogs, formatSummary } from "../retrievalStats.js";

const log = (scores, noInfo = false, feedback = null) => ({ results: scores.map((score) => ({ score })), noInfo, feedback });

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

  it("counts feedback separately for regular and \"no information\" answers", () => {
    const s = summarizeRetrievalLogs([
      log([0.5], false, "up"),
      log([0.5], false, "up"),
      log([0.5], false, "down"),
      log([0.5]),
      log([0.2], true, "down"),
      log([0.2], true),
    ]);

    expect(s.feedback.regular).toEqual({ answers: 4, rated: 3, up: 2, down: 1 });
    expect(s.feedback.noInfo).toEqual({ answers: 2, rated: 1, up: 0, down: 1 });
    expect(s.feedback.all).toEqual({ answers: 6, rated: 4, up: 2, down: 2 });
    expect(formatSummary(s)).toContain("| regular answers | 4 | 3 (75%) | 67% | 33% |");
    expect(formatSummary(s)).toContain('| "no information" answers | 2 | 1 (50%) | 0% | 100% |');
  });

  it("handles no logs", () => {
    const s = summarizeRetrievalLogs([]);

    expect(s).toMatchObject({ questions: 0, noInfo: 0, noResults: 0, meanTopScore: null });
    expect(formatSummary(s)).toContain("| questions | 0 |");
    expect(formatSummary(s)).toContain("| all | 0 | 0 (-) | - | - |");
  });
});
