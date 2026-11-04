import { RetrievalLog } from "../models.js";

// Top-score buckets: [label, lower bound inclusive]. The first matches the chat's 0.3 threshold.
const SCORE_BUCKETS = [
  ["< 0.3", -Infinity],
  ["0.3 - 0.4", 0.3],
  ["0.4 - 0.5", 0.4],
  ["0.5 - 0.6", 0.5],
  [">= 0.6", 0.6],
];

// Counts the records a condition holds for, as one field of a $group stage.
const countIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });

const IS_NO_INFO = "$noInfo";
const IS_REGULAR = { $not: ["$noInfo"] };
const ALWAYS = true;

// One $group field per bucket. A record without a top score has no number to compare, and
// MongoDB orders that below every number, so it falls below even the first bound.
const bucketFields = Object.fromEntries(SCORE_BUCKETS.map(([, min], i) => [
  `bucket${i}`,
  countIf({ $and: [{ $gte: ["$topScore", min] }, { $lt: ["$topScore", SCORE_BUCKETS[i + 1]?.[1] ?? Infinity] }] }),
]));

// Feedback counts for a group of answers: how many, how many were rated, and the ratings.
const feedbackFields = (group, applies) => ({
  [`${group}Answers`]: countIf(applies),
  [`${group}Rated`]: countIf({ $and: [applies, { $in: ["$feedback", ["up", "down"]] }] }),
  [`${group}Up`]: countIf({ $and: [applies, { $eq: ["$feedback", "up"] }] }),
  [`${group}Down`]: countIf({ $and: [applies, { $eq: ["$feedback", "down"] }] }),
});

const feedbackOf = (totals, group) => ({
  answers: totals[`${group}Answers`] ?? 0,
  rated: totals[`${group}Rated`] ?? 0,
  up: totals[`${group}Up`] ?? 0,
  down: totals[`${group}Down`] ?? 0,
});

/**
 * Summarize the retrieval logs of the last `days` days, counted back from `now`:
 * question count, share of "no information" answers, mean top-chunk score, and how
 * top scores are distributed. Questions that retrieved no chunk at all are counted
 * as `noResults`. Feedback is split by regular and "no information" answers.
 * Computed in the database, so no record is loaded here. Shared by `npm run eval:prod`
 * and the quality endpoint, so both report the same numbers. Only aggregates are returned.
 */
export async function getRetrievalSummary({ days, now = new Date() }) {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const [totals = {}] = await RetrievalLog.aggregate([
    { $match: { createdAt: { $gte: since, $lte: now } } },
    { $project: { noInfo: 1, feedback: 1, topScore: { $arrayElemAt: ["$results.score", 0] } } },
    {
      $group: {
        _id: null,
        questions: { $sum: 1 },
        noInfo: countIf(IS_NO_INFO),
        withResults: countIf({ $isNumber: "$topScore" }),
        meanTopScore: { $avg: "$topScore" },
        ...bucketFields,
        ...feedbackFields("regular", IS_REGULAR),
        ...feedbackFields("noInfo", IS_NO_INFO),
        ...feedbackFields("all", ALWAYS),
      },
    },
  ]);

  const questions = totals.questions ?? 0;
  return {
    questions,
    noInfo: totals.noInfo ?? 0,
    noResults: questions - (totals.withResults ?? 0),
    meanTopScore: totals.meanTopScore ?? null,
    buckets: SCORE_BUCKETS.map(([label], i) => ({ label, count: totals[`bucket${i}`] ?? 0 })),
    feedback: {
      regular: feedbackOf(totals, "regular"),
      noInfo: feedbackOf(totals, "noInfo"),
      all: feedbackOf(totals, "all"),
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
