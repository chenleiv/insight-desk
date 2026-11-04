// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { startMongoServer } from "../../__tests__/mongoMemory.js";
import { RetrievalLog } from "../../models.js";
import { getRetrievalSummary, formatSummary } from "../retrievalStats.js";

const docId = new mongoose.Types.ObjectId();
const NOW = new Date("2026-06-15T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const log = (scores, noInfo = false, feedback = null) => ({
  createdAt: new Date(NOW.getTime() - DAY),
  results: scores.map((score, index) => ({ docId, index, score })),
  noInfo,
  chunkSize: 600,
  minSimilarity: 0.3,
  ownerTag: "tag",
  feedback,
});

// The summary of these records, computed by the real database.
async function summarize(logs) {
  await RetrievalLog.create(logs);
  return getRetrievalSummary({ days: 30, now: NOW });
}

let mongo;

beforeAll(async () => {
  mongo = await startMongoServer();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(() => RetrievalLog.deleteMany({}));

describe("getRetrievalSummary", () => {
  it("counts questions, \"no information\" answers and top-score buckets", async () => {
    const s = await summarize([
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

  it("counts feedback separately for regular and \"no information\" answers", async () => {
    const s = await summarize([
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

  it("handles no logs", async () => {
    const s = await summarize([]);

    expect(s).toMatchObject({ questions: 0, noInfo: 0, noResults: 0, meanTopScore: null });
    expect(formatSummary(s)).toContain("| questions | 0 |");
    expect(formatSummary(s)).toContain("| all | 0 | 0 (-) | - | - |");
  });

  it("places a score on a bucket's lower bound in that bucket", async () => {
    const s = await summarize([log([0.29]), log([0.3]), log([0.4]), log([0.5]), log([0.6]), log([0.99])]);

    expect(s.buckets).toEqual([
      { label: "< 0.3", count: 1 },
      { label: "0.3 - 0.4", count: 1 },
      { label: "0.4 - 0.5", count: 1 },
      { label: "0.5 - 0.6", count: 1 },
      { label: ">= 0.6", count: 2 },
    ]);
  });

  it("uses only the first result's score as the top score", async () => {
    const s = await summarize([log([0.2, 0.9])]);

    expect(s.meanTopScore).toBeCloseTo(0.2);
    expect(s.buckets[0].count).toBe(1);
  });

  it("counts only the records inside the date range", async () => {
    const at = (time) => ({ ...log([0.5]), createdAt: new Date(time) });
    const s = await summarize([
      at(NOW.getTime() - 31 * DAY),
      at(NOW.getTime() - 29 * DAY),
      at(NOW.getTime()),
      at(NOW.getTime() + 1),
    ]);

    expect(s.questions).toBe(2);
  });

  it("counts a record saved before feedback existed as unrated", async () => {
    await RetrievalLog.create(log([0.5]));
    await RetrievalLog.collection.updateMany({}, { $unset: { feedback: "" } });

    const s = await getRetrievalSummary({ days: 30, now: NOW });

    expect(s.feedback.all).toEqual({ answers: 1, rated: 0, up: 0, down: 0 });
  });
});
