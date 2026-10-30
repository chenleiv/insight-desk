// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import bcrypt from "bcryptjs";

// In-memory stand-in for the users collection.
const { User, users } = vi.hoisted(() => {
  const users = [];
  const User = {
    countDocuments: vi.fn(async () => users.length),
    create: vi.fn(async (input) => input),
    findOne: vi.fn(async ({ email }) => users.find((u) => u.email === email) ?? null),
  };
  return { User, users };
});
vi.mock("../models.js", () => ({ User }));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const FRONTEND_URL = "https://web.example.com";
let server;
let baseUrl;

// Builds the app the way index.js does: middleware first, then the auth router.
async function start(crossSite) {
  vi.stubEnv("ADMIN_EMAIL", "");
  vi.stubEnv("ADMIN_PASSWORD", "");
  vi.stubEnv("FRONTEND_URL", FRONTEND_URL);
  vi.stubEnv("AUTH_COOKIE_CROSS_SITE", crossSite ? "true" : "");
  const { applyMiddleware } = await import("../middleware/setup.js");
  const auth = await import("../auth.js");
  const app = express();
  applyMiddleware(app);
  app.use(express.json());
  app.use("/api/auth", auth.default);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

beforeEach(async () => {
  users.length = 0;
  users.push({
    email: "user@example.com",
    role: "viewer",
    status: "active",
    password_hash: await bcrypt.hash("secret123", 4),
  });
  vi.resetModules();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await new Promise((resolve) => server.close(resolve));
});

const login = (origin) =>
  fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(origin && { Origin: origin }) },
    body: JSON.stringify({ email: "user@example.com", password: "secret123" }),
  });

const authCookie = (res) => res.headers.getSetCookie().find((c) => c.startsWith("access_token=")) ?? "";

describe("cross-site auth cookie", () => {
  it("keeps SameSite=Lax by default", async () => {
    await start(false);
    const res = await login(FRONTEND_URL);

    expect(res.status).toBe(200);
    expect(authCookie(res)).toMatch(/SameSite=Lax/i);
  });

  it("uses SameSite=None and Secure when the frontend is on another site", async () => {
    await start(true);
    const res = await login(FRONTEND_URL);

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(FRONTEND_URL);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(authCookie(res)).toMatch(/SameSite=None/i);
    expect(authCookie(res)).toMatch(/Secure/i);
  });

  it("clears the cookie on logout with the same attributes it was set with", async () => {
    await start(true);
    const res = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { Origin: FRONTEND_URL } });

    expect(authCookie(res)).toMatch(/SameSite=None/i);
    expect(authCookie(res)).toMatch(/Secure/i);
  });

  it("refuses a state-changing request from an origin that is not allowed", async () => {
    await start(true);
    const res = await login("https://evil.example.com");

    expect(res.status).toBe(403);
    expect(authCookie(res)).toBe("");
  });

  it("accepts requests without an Origin header", async () => {
    await start(true);
    const res = await login();

    expect(res.status).toBe(200);
  });

  it("does not check the origin when cross-site mode is off", async () => {
    await start(false);
    const res = await login("https://other.example.com");

    expect(res.status).toBe(200);
  });
});
