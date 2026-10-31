// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";

// In-memory stand-in for the users collection.
const { User, users } = vi.hoisted(() => {
  const users = [];
  const User = {
    countDocuments: vi.fn(async () => users.length),
    create: vi.fn(async (input) => {
      const created = { status: "active", ...input };
      users.push(created);
      return created;
    }),
    findOne: vi.fn(async ({ email }) => users.find((u) => u.email === email) ?? null),
  };
  return { User, users };
});
vi.mock("../models.js", () => ({ User }));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const realFetch = globalThis.fetch;
const FRONTEND_URL = "http://app.test";
let server;
let baseUrl;
let googleCalls;

beforeEach(async () => {
  users.length = 0;
  googleCalls = [];
  vi.resetModules();
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
  vi.stubEnv("FRONTEND_URL", FRONTEND_URL);
  // Fake Google's token and profile endpoints; requests to the test server stay real.
  vi.stubGlobal("fetch", async (url, init) => {
    if (String(url).startsWith("https://oauth2.googleapis.com/token")) {
      googleCalls.push("token");
      return Response.json({ access_token: "google-access-token" });
    }
    if (String(url).startsWith("https://www.googleapis.com/oauth2/v2/userinfo")) {
      googleCalls.push("userinfo");
      return Response.json({ email: "user@example.com" });
    }
    return realFetch(url, init);
  });
  const auth = await import("../auth.js");
  const app = express();
  app.use(cookieParser());
  app.use("/api/auth", auth.default);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await new Promise((resolve) => server.close(resolve));
});

const get = (path, cookie) =>
  fetch(`${baseUrl}${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} });

// Start the flow and return the state sent to Google plus the state cookie.
async function startLogin() {
  const res = await get("/api/auth/google");
  const location = new URL(res.headers.get("location"));
  const setCookie = res.headers.get("set-cookie") ?? "";
  return { res, state: location.searchParams.get("state"), setCookie, cookie: setCookie.split(";")[0] };
}

describe("Google OAuth state", () => {
  it("sends a random state to Google and keeps it in an HttpOnly cookie", async () => {
    const first = await startLogin();
    const second = await startLogin();

    expect(first.res.status).toBe(302);
    expect(first.state).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(first.state).not.toBe(second.state);
    expect(first.cookie).toBe(`oauth_state=${first.state}`);
    expect(first.setCookie).toMatch(/HttpOnly/i);
    expect(first.setCookie).toMatch(/SameSite=Lax/i);
    expect(first.setCookie).toMatch(/Path=\/api\/auth\/google/i);
    expect(first.setCookie).toMatch(/Max-Age=600/i);
  });

  it("signs in when the returned state matches the cookie, and clears the cookie", async () => {
    const { state, cookie } = await startLogin();
    const res = await get(`/api/auth/google/callback?code=abc&state=${state}`, cookie);

    expect(res.headers.get("location")).toBe(`${FRONTEND_URL}/hub`);
    expect(googleCalls).toEqual(["token", "userinfo"]);
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.some((c) => c.startsWith("access_token="))).toBe(true);
    expect(setCookies.some((c) => /^oauth_state=;/.test(c))).toBe(true);
  });

  it.each([
    ["no state and no cookie", "/api/auth/google/callback?code=abc", undefined],
    ["a state but no cookie", "/api/auth/google/callback?code=abc&state=forged", undefined],
    ["a cookie but no state", "/api/auth/google/callback?code=abc", "oauth_state=expected"],
    ["a state that does not match the cookie", "/api/auth/google/callback?code=abc&state=forged", "oauth_state=expected"],
  ])("rejects a callback with %s before calling Google", async (_, path, cookie) => {
    const res = await get(path, cookie);

    expect(res.headers.get("location")).toBe(`${FRONTEND_URL}/login?error=google_state_mismatch`);
    expect(googleCalls).toEqual([]);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("access_token="))).toBe(false);
  });

  it("does not accept the same state twice", async () => {
    const { state, cookie } = await startLogin();
    const first = await get(`/api/auth/google/callback?code=abc&state=${state}`, cookie);
    expect(first.headers.get("location")).toBe(`${FRONTEND_URL}/hub`);

    // The browser drops the cleared cookie, so a replay arrives without it.
    googleCalls = [];
    const replay = await get(`/api/auth/google/callback?code=abc&state=${state}`);
    expect(replay.headers.get("location")).toBe(`${FRONTEND_URL}/login?error=google_state_mismatch`);
    expect(googleCalls).toEqual([]);
  });
});

describe("cookies in production", () => {
  // Restart the server with the auth module loaded under production settings.
  beforeEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "test-secret-for-production-cookies");
    const auth = await import("../auth.js");
    const app = express();
    app.use(cookieParser());
    app.use("/api/auth", auth.default);
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  it("marks the state cookie and the session cookie Secure", async () => {
    const { state, cookie, setCookie } = await startLogin();
    expect(setCookie).toMatch(/;\s*Secure/i);

    const res = await get(`/api/auth/google/callback?code=abc&state=${state}`, cookie);
    const session = res.headers.getSetCookie().find((c) => c.startsWith("access_token="));
    expect(session).toMatch(/;\s*Secure/i);
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
  });
});
