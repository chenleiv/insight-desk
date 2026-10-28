// Top-score buckets: [label, lower bound inclusive]. The first matches the chat's 0.3 threshold.
export const SCORE_BUCKETS = [
  ["< 0.3", -Infinity],
  ["0.3 - 0.4", 0.3],
  ["0.4 - 0.5", 0.4],
  ["0.5 - 0.6", 0.5],
  [">= 0.6", 0.6],
];

/**
 * Summarize retrieval logs: question count, share of "no information"
 * answers, mean top-chunk score, and how top scores are distributed.
 * Questions that retrieved no chunk at all are counted as `noResults`.
 */
export function summarizeRetrievalLogs(logs) {
  const topScores = logs.filter((l) => l.results.length).map((l) => l.results[0].score);
  const buckets = SCORE_BUCKETS.map(([label]) => ({ label, count: 0 }));
  for (const score of topScores) {
    const i = SCORE_BUCKETS.findLastIndex(([, min]) => score >= min);
    buckets[i].count++;
  }

  return {
    questions: logs.length,
    noInfo: logs.filter((l) => l.noInfo).length,
    noResults: logs.length - topScores.length,
    meanTopScore: topScores.length ? topScores.reduce((a, b) => a + b, 0) / topScores.length : null,
    buckets,
  };
}

const pct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : "-");

/** Render a summary as a Markdown table. */
export function formatSummary(s) {
  return [
    "| metric | value |",
    "|---|---|",
    `| questions | ${s.questions} |`,
    `| "no information" answers | ${s.noInfo} (${pct(s.noInfo, s.questions)}) |`,
    `| mean top-chunk score | ${s.meanTopScore === null ? "-" : s.meanTopScore.toFixed(3)} |`,
    `| no chunks retrieved | ${s.noResults} |`,
    ...s.buckets.map((b) => `| top score ${b.label} | ${b.count} (${pct(b.count, s.questions - s.noResults)}) |`),
  ].join("\n");
}
