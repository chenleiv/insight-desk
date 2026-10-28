// Top-score buckets: [label, lower bound inclusive]. The first matches the chat's 0.3 threshold.
export const SCORE_BUCKETS = [
  ["< 0.3", -Infinity],
  ["0.3 - 0.4", 0.3],
  ["0.4 - 0.5", 0.4],
  ["0.5 - 0.6", 0.5],
  [">= 0.6", 0.6],
];

// Feedback counts for a group of answers: how many, how many were rated, and the ratings.
function countFeedback(logs) {
  return {
    answers: logs.length,
    rated: logs.filter((l) => l.feedback).length,
    up: logs.filter((l) => l.feedback === "up").length,
    down: logs.filter((l) => l.feedback === "down").length,
  };
}

/**
 * Summarize retrieval logs: question count, share of "no information"
 * answers, mean top-chunk score, and how top scores are distributed.
 * Questions that retrieved no chunk at all are counted as `noResults`.
 * Feedback is split by regular and "no information" answers.
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
    feedback: {
      regular: countFeedback(logs.filter((l) => !l.noInfo)),
      noInfo: countFeedback(logs.filter((l) => l.noInfo)),
      all: countFeedback(logs),
    },
  };
}

const pct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : "-");

/** Render a summary as Markdown tables: retrieval, then feedback. Up and down are shares of rated answers. */
export function formatSummary(s) {
  return [
    "| metric | value |",
    "|---|---|",
    `| questions | ${s.questions} |`,
    `| "no information" answers | ${s.noInfo} (${pct(s.noInfo, s.questions)}) |`,
    `| mean top-chunk score | ${s.meanTopScore === null ? "-" : s.meanTopScore.toFixed(3)} |`,
    `| no chunks retrieved | ${s.noResults} |`,
    ...s.buckets.map((b) => `| top score ${b.label} | ${b.count} (${pct(b.count, s.questions - s.noResults)}) |`),
    "",
    "| feedback | answers | rated | up | down |",
    "|---|---|---|---|---|",
    ...[["regular answers", s.feedback.regular], ['"no information" answers', s.feedback.noInfo], ["all", s.feedback.all]].map(
      ([label, f]) => `| ${label} | ${f.answers} | ${f.rated} (${pct(f.rated, f.answers)}) | ${pct(f.up, f.rated)} | ${pct(f.down, f.rated)} |`,
    ),
  ].join("\n");
}
