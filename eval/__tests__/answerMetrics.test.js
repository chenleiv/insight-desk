// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import os from "os";
import path from "path";
import {
  formatViolations, hasTitleInBrackets, hasHebrew, retryAfterMs, withRetry, AuthError, BACKOFF_MS,
  assertOutsideRepo, summarize, formatSummaryTable, cell,
} from "../answerMetrics.js";

describe("formatViolations", () => {
  it.each([
    ["a table", "| a | b |\n|---|---|\n| 1 | 2 |", ["table"]],
    ["a heading", "## Answer\nText", ["heading"]],
    ["a link", "See [the policy](https://example.com).", ["link"]],
    ["an image", "![logo](logo.png)", ["image"]],
  ])("finds %s", (_label, answer, expected) => {
    expect(formatViolations(answer)).toEqual(expected);
  });

  it("allows lists, bold and citations", () => {
    expect(formatViolations("**Two** steps:\n- Ask the lead [c1]\n1. Wait [c1, c2]")).toEqual([]);
  });
});

describe("hasTitleInBrackets", () => {
  const titles = ["Security Incident Response"];

  it.each(["See [Security Incident Response].", "See 【security incident response】."])("finds %j", (answer) => {
    expect(hasTitleInBrackets(answer, titles)).toBe(true);
  });

  it("ignores chunk citations and titles without brackets", () => {
    expect(hasTitleInBrackets("Security Incident Response says P1 [c1].", titles)).toBe(false);
  });
});

describe("hasHebrew", () => {
  it("tells Hebrew from English", () => {
    expect(hasHebrew("שלום [c1]")).toBe(true);
    expect(hasHebrew("Hello [c1]")).toBe(false);
  });
});

describe("retryAfterMs", () => {
  it("reads seconds from a plain header object or a Headers instance", () => {
    expect(retryAfterMs({ headers: { "retry-after": "7" } })).toBe(7000);
    expect(retryAfterMs({ headers: new Headers({ "retry-after": "1.5" }) })).toBe(1500);
  });

  it("reads an HTTP date", () => {
    const now = Date.parse("2026-11-01T10:00:00Z");
    expect(retryAfterMs({ headers: { "retry-after": "Sun, 01 Nov 2026 10:00:30 GMT" } }, now)).toBe(30_000);
  });

  it("returns null without a usable header", () => {
    expect(retryAfterMs({})).toBeNull();
    expect(retryAfterMs({ headers: { "retry-after": "soon" } })).toBeNull();
  });
});

describe("withRetry", () => {
  const rateLimited = (headers = {}) => Object.assign(new Error("429"), { status: 429, headers });

  it("waits for retry-after, then returns the result", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn().mockRejectedValueOnce(rateLimited({ "retry-after": "3" })).mockResolvedValueOnce("ok");

    expect(await withRetry(fn, { sleep })).toBe("ok");
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it("backs off without retry-after, and throws after the last retry", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn().mockRejectedValue(rateLimited());

    await expect(withRetry(fn, { sleep })).rejects.toThrow("429");
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual(BACKOFF_MS);
    expect(fn).toHaveBeenCalledTimes(BACKOFF_MS.length + 1);
  });

  it("stops at once on 401", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error("bad key"), { status: 401 }));

    await expect(withRetry(fn, { sleep })).rejects.toBeInstanceOf(AuthError);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not retry other errors", async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error("server"), { status: 500 }));

    await expect(withRetry(fn, { sleep: vi.fn() })).rejects.toThrow("server");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("assertOutsideRepo", () => {
  const repo = path.join(os.tmpdir(), "repo");

  it.each([path.join(repo, "out.md"), path.join(repo, "eval", "out.md"), repo])("rejects %s", (out) => {
    expect(() => assertOutsideRepo(out, repo)).toThrow(/outside the repository/);
  });

  it.each([path.join(os.tmpdir(), "out.md"), path.join(os.tmpdir(), "repo-results", "out.md")])("accepts %s", (out) => {
    expect(() => assertOutsideRepo(out, repo)).not.toThrow();
  });
});

describe("summarize", () => {
  const row = (wording, fields = {}) => ({
    set: "hebrew", wording, refusal: false, empty: false, citations: 1, invented: 0,
    violations: [], titleInBrackets: false, inHebrew: true, ...fields,
  });

  it("counts each check over the answers that came back, and errors apart", () => {
    const [old, next] = summarize(
      [
        row("old"),
        row("old", { refusal: true, citations: 0, inHebrew: false }),
        row("old", { error: "429" }),
        row("new", { invented: 2, violations: ["table"], titleInBrackets: true, inHebrew: false }),
      ],
      ["related", "hebrew"],
      ["old", "new"],
    );

    expect(old).toEqual({
      set: "hebrew", wording: "old", calls: 3, errors: 1, refusals: "1/2", empty: "0/2", truncated: "0/2", cited: "1/2",
      invented: 0, format: "0/2", titleBrackets: "0/2", hebrew: "1/1",
    });
    expect(next).toMatchObject({ calls: 1, invented: 2, format: "1/1", titleBrackets: "1/1", hebrew: "0/1" });
  });

  it("counts answers cut off at the token limit, and shows them in the table", () => {
    const rows = [row("new", { truncated: true }), row("new"), row("new", { error: "429" })];

    expect(summarize(rows, ["hebrew"], ["new"])[0].truncated).toBe("1/2");
    expect(formatSummaryTable(summarize(rows, ["hebrew"], ["new"]))).toContain("| 0/2 | 0/2 | 1/2 |");
  });

  it("renders one table row per group", () => {
    const table = formatSummaryTable(summarize([row("old")], ["hebrew"], ["old"]));
    expect(table.split("\n")).toHaveLength(3);
    expect(table).toContain("| hebrew | old | 1 | 0 | 0/1 |");
  });
});

describe("cell", () => {
  it("escapes pipes and keeps line breaks", () => {
    expect(cell("a | b\nc")).toBe("a \\| b<br>c");
  });

  it("escapes backslashes before pipes, so a backslash cannot unescape a pipe", () => {
    expect(cell("a\\b")).toBe("a\\\\b");
    expect(cell("a|b")).toBe("a\\|b");
    expect(cell("a\\|b")).toBe("a\\\\\\|b");
    expect(cell("a\nb")).toBe("a<br>b");
  });
});
