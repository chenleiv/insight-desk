// @vitest-environment node
import { describe, it, expect } from "vitest";
import { execFile } from "child_process";
import { fileURLToPath } from "url";

const AUTH_MODULE = new URL("../auth.js", import.meta.url).href;
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const REAL_SECRET = "a-throwaway-secret-used-only-by-this-test";
// Starting a process that loads the routes takes far longer than a unit test.
const PROCESS_TEST_TIMEOUT_MS = 30_000;

// Loads auth.js in a new process with only the given variables. index.js is not used
// because it would also load the env file, whose values must not affect this test.
function loadAuth(env) {
  const script = `await import(${JSON.stringify(AUTH_MODULE)}); process.exit(0);`;
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ["--input-type=module", "-e", script],
      { cwd: REPO_ROOT, env: { PATH: process.env.PATH, ...env }, timeout: PROCESS_TEST_TIMEOUT_MS - 5_000 },
      (error, _stdout, stderr) => resolve({ exitCode: error ? error.code : 0, stderr }),
    );
  });
}

describe("startup without a real secret", () => {
  it.concurrent.each([
    ["no NODE_ENV and no secret", {}],
    ["production and no secret", { NODE_ENV: "production" }],
    ["an unknown NODE_ENV and no secret", { NODE_ENV: "staging" }],
    ["ENV=prod with NODE_ENV=development", { ENV: "prod", NODE_ENV: "development" }],
    ["a blank secret", { JWT_SECRET: "   " }],
    ["the development secret", { JWT_SECRET: "dev-secret-change-me" }],
    ["the placeholder secret", { NODE_ENV: "production", JWT_SECRET: "your-secret" }],
  ])("refuses with %s", async (_label, env) => {
    const { exitCode, stderr } = await loadAuth(env);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("JWT_SECRET must be set");
  }, PROCESS_TEST_TIMEOUT_MS);

  it.concurrent.each([
    ["development without a secret", { NODE_ENV: "development" }],
    ["tests without a secret", { NODE_ENV: "test" }],
    ["production with a real secret", { NODE_ENV: "production", JWT_SECRET: REAL_SECRET }],
    ["no NODE_ENV with a real secret", { JWT_SECRET: REAL_SECRET }],
  ])("starts in %s", async (_label, env) => {
    const { exitCode, stderr } = await loadAuth(env);

    expect(stderr).not.toContain("JWT_SECRET must be set");
    expect(exitCode).toBe(0);
  }, PROCESS_TEST_TIMEOUT_MS);
});
