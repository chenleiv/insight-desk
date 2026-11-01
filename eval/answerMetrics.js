/**
 * Pure helpers for eval/answers.js: answer checks, the rate-limit retry, the
 * output path check and the Markdown summary. Kept apart so they can be tested
 * without the embedding model or Groq.
 */
import path from "path";

/** Markdown the chat must not contain: tables, headings, links and images. */
const FORMAT_RULES = [
  ["table", /^\s*\|.*\|\s*$/m],
  ["heading", /^\s{0,3}#{1,6}\s/m],
  ["image", /!\[[^\]\n]*\]\([^)\n]*\)/],
  ["link", /(?<!!)\[[^\]\n]+\]\([^)\s]+\)/],
];

/** The kinds of forbidden Markdown found in an answer, e.g. ["table", "link"]. */
export function formatViolations(answer) {
  return FORMAT_RULES.filter(([, pattern]) => pattern.test(answer)).map(([kind]) => kind);
}

/** True when the answer names a document title in brackets instead of citing a chunk id. */
export function hasTitleInBrackets(answer, titles) {
  const text = answer.toLowerCase();
  return titles.some((title) => {
    const t = title.toLowerCase();
    return text.includes(`[${t}]`) || text.includes(`【${t}】`);
  });
}

/** True when the text holds at least one Hebrew letter. */
export function hasHebrew(text) {
  return /\p{Script=Hebrew}/u.test(text);
}

export class AuthError extends Error {}

// Waits after each 429 that has no retry-after header.
export const BACKOFF_MS = [5_000, 10_000, 20_000, 40_000, 60_000];

/** The wait asked for by a retry-after header (seconds or an HTTP date), or null. */
export function retryAfterMs(error, now = Date.now()) {
  const headers = error?.headers;
  const value = typeof headers?.get === "function" ? headers.get("retry-after") : headers?.["retry-after"];
  if (value == null || value === "") return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/**
 * Call `fn`, retrying after a rate limit (429) up to BACKOFF_MS.length times.
 * A 401 throws AuthError at once, since no retry can fix a bad key. Any other
 * error, or a 429 after the last retry, is thrown to the caller.
 */
export async function withRetry(fn, { sleep, onRetry = () => {} }) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error?.status === 401) throw new AuthError("Groq rejected GROQ_API_KEY (401)");
      if (error?.status !== 429 || attempt >= BACKOFF_MS.length) throw error;
      const wait = retryAfterMs(error) ?? BACKOFF_MS[attempt];
      onRetry({ attempt: attempt + 1, wait });
      await sleep(wait);
    }
  }
}

/** Throw if `outPath` is inside `repoRoot`, so results are never committed by accident. */
export function assertOutsideRepo(outPath, repoRoot) {
  const relative = path.relative(path.resolve(repoRoot), path.resolve(outPath));
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    throw new Error(`--out must be outside the repository: ${outPath}`);
  }
}

const count = (rows, test) => rows.filter(test).length;
const ratio = (n, total) => `${n}/${total}`;

/**
 * One summary row per set and wording, in the order given. Each row counts
 * the answers that came back (errors are counted apart) and the checks on them.
 */
export function summarize(rows, sets, wordings) {
  const summary = [];
  for (const set of sets) {
    for (const wording of wordings) {
      const group = rows.filter((r) => r.set === set && r.wording === wording);
      if (!group.length) continue;
      const answered = group.filter((r) => !r.error);
      const n = answered.length;
      summary.push({
        set,
        wording,
        calls: group.length,
        errors: group.length - n,
        refusals: ratio(count(answered, (r) => r.refusal), n),
        empty: ratio(count(answered, (r) => r.empty), n),
        cited: ratio(count(answered, (r) => r.citations > 0), n),
        invented: answered.reduce((sum, r) => sum + r.invented, 0),
        format: ratio(count(answered, (r) => r.violations.length > 0), n),
        titleBrackets: ratio(count(answered, (r) => r.titleInBrackets), n),
        hebrew: set === "hebrew" ? ratio(count(answered, (r) => r.inHebrew), count(answered, (r) => !r.refusal && !r.empty)) : "-",
      });
    }
  }
  return summary;
}

/** Render summarize() output as a Markdown table. */
export function formatSummaryTable(summary) {
  return [
    "| set | wording | calls | errors | refusals | empty | with a valid citation | invented citation ids | format violations | title in brackets | answered in Hebrew |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...summary.map((s) =>
      `| ${s.set} | ${s.wording} | ${s.calls} | ${s.errors} | ${s.refusals} | ${s.empty} | ${s.cited} | ${s.invented} | ${s.format} | ${s.titleBrackets} | ${s.hebrew} |`,
    ),
  ].join("\n");
}

/** Make text safe for one Markdown table cell. */
export function cell(text) {
  return String(text ?? "").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}
