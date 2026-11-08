/**
 * Answer eval: compare the app's prompt (DEFAULT_PROMPT in backend/prompts.js)
 * with an experimental wording (eval/prompts/experiment.txt) on the demo
 * documents. Retrieval runs locally as in eval/threshold.js; each question is
 * then sent to Groq with each wording, with the same model, settings, context
 * and appended rules as the chat. Requests run one at a time, with a delay,
 * and wait and retry after a rate limit, so the free tier is enough.
 *
 * Sets:
 *   related  questions.json questions whose best chunk reaches MIN_SIMILARITY
 *   forced   unrelated-questions.json, plus related questions below the
 *            threshold, sent with their top chunks anyway (the chat would not
 *            call the model for them) to test refusals on unhelpful context
 *   hebrew   five questions translated to Hebrew by the model at the start of
 *            the run; each wording gets the same translation
 *
 * GROQ_API_KEY is read from the environment only; no .env file is loaded.
 * Results are printed and written to a file outside the repository.
 *
 * Usage: npm run eval:answers -- [--runs 3] [--sets related,forced,hebrew]
 *          [--delay 2000] [--out <file>] [--dry-run]
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import Groq from "groq-sdk";
import { buildDocumentChunks } from "../backend/rag/buildChunks.js";
import { embeddingText } from "../backend/rag/embeddingInput.js";
import { embed } from "../backend/rag/embed.js";
import { cosineSimilarity } from "../backend/rag/similarity.js";
import {
  CHAT_MODEL, CHAT_ANSWER_SETTINGS, CONTEXT_CHUNKS, MIN_SIMILARITY,
  systemContent, userContent, verifyCitations, isNoInfoAnswer,
} from "../backend/ai.js";
import { DEFAULT_PROMPT } from "../backend/prompts.js";
import {
  formatViolations, hasTitleInBrackets, hasHebrew, withRetry, AuthError,
  assertOutsideRepo, summarize, formatSummaryTable, cell,
} from "./answerMetrics.js";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const ALL_SETS = ["related", "forced", "hebrew"];
// Four related questions and one unrelated one, to check the language rule and a refusal in Hebrew.
const HEBREW_IDS = ["q03", "q07", "q16", "q20", "u11"];
// The default wording is read from the code, so the eval always measures what the app sends.
const WORDINGS = [
  { name: "default", source: "DEFAULT_PROMPT in backend/prompts.js", text: DEFAULT_PROMPT },
  { name: "experiment", source: "eval/prompts/experiment.txt", file: "prompts/experiment.txt" },
];

function parseArgs(argv) {
  const value = (flag, fallback) => {
    const i = argv.indexOf(flag);
    return i === -1 ? fallback : argv[i + 1];
  };
  const runs = Number(value("--runs", "3"));
  const delay = Number(value("--delay", "2000"));
  const sets = value("--sets", ALL_SETS.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  if (!Number.isInteger(runs) || runs < 1) throw new Error("--runs must be a positive whole number");
  if (!Number.isInteger(delay) || delay < 0) throw new Error("--delay must be a whole number of milliseconds");
  const unknown = sets.filter((s) => !ALL_SETS.includes(s));
  if (!sets.length || unknown.length) throw new Error(`--sets takes a comma-separated list of: ${ALL_SETS.join(", ")}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = path.resolve(value("--out", path.join(os.tmpdir(), "insight-desk-eval", `answers-${stamp}.md`)));
  assertOutsideRepo(out, REPO_ROOT);
  return { runs, delay, sets, out, dryRun: argv.includes("--dry-run") };
}

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const readText = (p) => readFileSync(new URL(p, import.meta.url), "utf8").trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Embed every demo chunk with its title, as the server does. */
async function buildIndex(documents) {
  const index = [];
  for (const doc of documents) {
    for (const c of buildDocumentChunks(doc)) {
      index.push({ docId: doc.title, title: doc.title, index: c.index, text: c.text, embedding: await embed(embeddingText(doc.title, c.text)) });
    }
  }
  return index;
}

/** The top chunks for a question, best first, as search() returns them. */
async function retrieve(index, question) {
  const vector = await embed(question);
  return index
    .map(({ embedding, ...c }) => ({ ...c, score: cosineSimilarity(vector, embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, CONTEXT_CHUNKS);
}

/** The chunks the chat would send, or, when none pass the threshold, the top chunks anyway. */
function contextFor(top) {
  const passing = top.filter((c) => c.score >= MIN_SIMILARITY);
  return { chunks: passing.length ? passing : top, forced: !passing.length };
}

async function buildItems(index, sets) {
  const related = readJson("./questions.json");
  const unrelated = readJson("./unrelated-questions.json");
  const items = [];
  for (const q of related) {
    const { chunks, forced } = contextFor(await retrieve(index, q.question));
    const set = forced ? "forced" : "related";
    if (sets.includes(set)) items.push({ set, id: q.id, question: q.question, expected: q.expected, chunks });
  }
  if (sets.includes("forced")) {
    for (const q of unrelated) {
      items.push({ set: "forced", id: q.id, question: q.question, expected: "(not in the documents)", chunks: (await retrieve(index, q.question)) });
    }
  }
  if (sets.includes("hebrew")) {
    // Retrieved with the English question, so only the question's language differs.
    for (const id of HEBREW_IDS) {
      const q = [...related, ...unrelated].find((x) => x.id === id);
      const { chunks } = contextFor(await retrieve(index, q.question));
      items.push({ set: "hebrew", id, english: q.question, question: null, expected: q.expected ?? "(not in the documents)", chunks });
    }
  }
  return items;
}

async function translateToHebrew(groq, question) {
  const response = await groq.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: "Translate the user's question into Hebrew. Reply with the translation only." },
      { role: "user", content: question },
    ],
    max_tokens: 300,
    temperature: 0,
    reasoning_effort: "low",
  });
  const text = response.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("empty translation");
  return text;
}

/** Ask the model as the chat does, and check the answer. */
async function ask(groq, prompt, item) {
  const response = await groq.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: systemContent(prompt) },
      { role: "user", content: userContent(item.chunks, item.question) },
    ],
    ...CHAT_ANSWER_SETTINGS,
  });
  const choice = response.choices?.[0];
  const raw = choice?.message?.content ?? "";
  const { answer, citations, unknown } = verifyCitations(raw, item.chunks);
  return {
    answer,
    empty: !answer,
    // Stopped at max_tokens. The chat would cut this answer to its last complete sentence; the eval keeps it whole.
    truncated: choice?.finish_reason === "length",
    refusal: !!answer && isNoInfoAnswer(answer),
    citations: citations.length,
    invented: unknown.length,
    violations: formatViolations(raw),
    titleInBrackets: hasTitleInBrackets(raw, [...new Set(item.chunks.map((c) => c.title))]),
    inHebrew: hasHebrew(answer),
  };
}

function report({ args, rows, items, translations, notes, finished }) {
  const summary = formatSummaryTable(summarize(rows, args.sets, WORDINGS.map((w) => w.name)));
  const counts = args.sets.map((s) => `${s} ${items.filter((i) => i.set === s).length}`).join(", ");
  const details = [
    "| set | id | wording | run | expected | answer | checks | correct? |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => {
      const checks = r.error
        ? `error: ${r.error}`
        : [r.refusal && "refusal", r.empty && "empty", r.truncated && "cut off", r.invented && `${r.invented} invented`, ...r.violations, r.titleInBrackets && "title in brackets"].filter(Boolean).join(", ");
      return `| ${r.set} | ${r.id} | ${r.wording} | ${r.run} | ${cell(r.expected)} | ${cell(r.answer)} | ${cell(checks)} |  |`;
    }),
  ].join("\n");
  const translationTable = translations.length
    ? ["| id | English | Hebrew |", "|---|---|---|", ...translations.map((t) => `| ${t.id} | ${cell(t.english)} | ${cell(t.hebrew)} |`)].join("\n")
    : "(none)";

  return `# Answer eval: default vs experiment prompt wording

Generated by \`npm run eval:answers\` on ${new Date().toISOString()}${finished ? "" : " (incomplete: the run stopped early)"}.
Model \`${CHAT_MODEL}\`, settings ${JSON.stringify(CHAT_ANSWER_SETTINGS)}, MIN_SIMILARITY ${MIN_SIMILARITY}, ${args.runs} run(s) per question and wording.
Questions per set: ${counts}. Wordings: ${WORDINGS.map((w) => `${w.name} = ${w.source}`).join(", ")}.
${notes.length ? `\nNotes:\n${notes.map((n) => `- ${n}`).join("\n")}\n` : ""}
## Summary

${summary}

## Hebrew translations

${translationTable}

## Answers

Fill in "correct?" by comparing each answer with "expected".

${details}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prompts = Object.fromEntries(WORDINGS.map((w) => [w.name, w.text ?? readText(w.file)]));

  console.error("Embedding the demo documents...");
  const index = await buildIndex(readJson("../backend/demo/sample-documents.json"));
  const items = await buildItems(index, args.sets);
  const calls = items.length * WORDINGS.length * args.runs;
  const hebrewCount = items.filter((i) => i.set === "hebrew").length;

  if (args.dryRun) {
    for (const set of args.sets) console.log(`${set}: ${items.filter((i) => i.set === set).map((i) => i.id).join(", ")}`);
    console.log(`\n${calls} answer calls${hebrewCount ? ` and ${hebrewCount} translation calls` : ""}, at least ${Math.ceil(((calls + hebrewCount) * args.delay) / 60000)} minutes with --delay ${args.delay}.`);
    console.log(`Results would be written to ${args.out}`);
    return;
  }

  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set in the environment");
  // Retries are handled below, so each wait is visible and the SDK does not add its own.
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: 0 });
  mkdirSync(path.dirname(args.out), { recursive: true });
  console.error(`Results will be written to ${args.out}`);

  const rows = [];
  const translations = [];
  const notes = [];
  const save = (finished) => writeFileSync(args.out, report({ args, rows, items, translations, notes, finished }));
  const call = async (fn) => {
    const result = await withRetry(fn, {
      sleep,
      onRetry: ({ attempt, wait }) => console.error(`  rate limited, waiting ${Math.round(wait / 1000)}s (retry ${attempt})`),
    });
    await sleep(args.delay);
    return result;
  };

  try {
    for (const item of items.filter((i) => i.set === "hebrew")) {
      try {
        item.question = await call(() => translateToHebrew(groq, item.english));
        translations.push({ id: item.id, english: item.english, hebrew: item.question });
      } catch (error) {
        if (error instanceof AuthError) throw error;
        notes.push(`${item.id} was skipped: its translation failed (${error.message}).`);
      }
    }
    const runnable = items.filter((i) => i.question);

    let done = 0;
    const total = runnable.length * WORDINGS.length * args.runs;
    // Wordings alternate per question, so a slow or limited stretch affects both alike.
    for (let run = 1; run <= args.runs; run++) {
      for (const item of runnable) {
        for (const { name } of WORDINGS) {
          console.error(`[${++done}/${total}] ${item.set} ${item.id} ${name} run ${run}`);
          const base = { set: item.set, id: item.id, wording: name, run, expected: item.expected };
          try {
            rows.push({ ...base, ...(await call(() => ask(groq, prompts[name], item))) });
          } catch (error) {
            if (error instanceof AuthError) throw error;
            rows.push({ ...base, error: error.message ?? String(error), answer: "" });
          }
          save(false);
        }
      }
    }
    save(true);
  } catch (error) {
    if (rows.length || translations.length) save(false);
    throw error;
  }

  console.log(formatSummaryTable(summarize(rows, args.sets, WORDINGS.map((w) => w.name))));
  if (notes.length) console.log(`\n${notes.join("\n")}`);
  console.log(`\nFull results: ${args.out}`);
}

main().catch((error) => {
  console.error(`Answer eval failed: ${error.message}`);
  process.exitCode = 1;
});
