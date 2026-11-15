// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// Keeps the test from loading the real model when the routes are imported.
vi.mock("../rag/embed.js", () => ({ embed: vi.fn() }));

import { createApp } from "../app.js";
import { logger } from "../logger.js";

let distPath;
let server;
let base;

beforeAll(async () => {
  distPath = mkdtempSync(path.join(tmpdir(), "insight-desk-log-"));
  writeFileSync(path.join(distPath, "index.html"), "<!doctype html><title>Insight Desk</title>");
  await new Promise((resolve) => {
    server = createApp({ distPath }).listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(distPath, { recursive: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// The request lines logged for one page request and one API request under the given environment.
async function loggedRequests(env) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const info = vi.spyOn(logger, "info").mockImplementation(() => {});
  await fetch(`${base}/hub`);
  await fetch(`${base}/api/missing`);
  return info.mock.calls.map(([message]) => message).filter((m) => /^GET \//.test(m));
}

describe("request logging", () => {
  it.each([
    ["development", { NODE_ENV: "development", ENV: "" }],
    ["tests", { NODE_ENV: "test", ENV: "" }],
  ])("logs page and API requests under %s", async (_label, env) => {
    expect(await loggedRequests(env)).toEqual(["GET /hub", "GET /api/missing"]);
  });

  it.each([
    ["production", { NODE_ENV: "production", ENV: "" }],
    ["no NODE_ENV", { NODE_ENV: "", ENV: "" }],
    ["ENV=prod with NODE_ENV=development", { NODE_ENV: "development", ENV: "prod" }],
  ])("logs API requests only under %s", async (_label, env) => {
    expect(await loggedRequests(env)).toEqual(["GET /api/missing"]);
  });
});
