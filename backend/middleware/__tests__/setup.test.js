// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import {
  applyMiddleware,
  apiNotFound,
  jsonBody,
  parseTrustProxyHops,
  spaFallbackLimiter,
  SPA_FALLBACK_LIMIT,
} from "../setup.js";
import { errorHandler } from "../errorHandler.js";
import { logger } from "../../logger.js";

let server;

// App with the real middleware and one route that echoes the client IP seen by Express.
async function startApp(trustProxyHops) {
  if (trustProxyHops === undefined) delete process.env.TRUST_PROXY_HOPS;
  else process.env.TRUST_PROXY_HOPS = trustProxyHops;

  const app = express();
  applyMiddleware(app);
  app.get("/api/ip", (req, res) => res.json({ ip: req.ip }));
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function clientIp(baseUrl, forwardedFor) {
  const headers = forwardedFor ? { "X-Forwarded-For": forwardedFor } : {};
  const res = await fetch(`${baseUrl}/api/ip`, { headers });
  return (await res.json()).ip;
}

afterEach(async () => {
  delete process.env.TRUST_PROXY_HOPS;
  if (server) await new Promise((resolve) => server.close(resolve));
  server = undefined;
});

describe("parseTrustProxyHops", () => {
  it("defaults to trusting no proxy", () => {
    expect(parseTrustProxyHops(undefined)).toBe(0);
    expect(parseTrustProxyHops("")).toBe(0);
  });

  it("accepts a non-negative hop count", () => {
    expect(parseTrustProxyHops("0")).toBe(0);
    expect(parseTrustProxyHops("2")).toBe(2);
  });

  it("falls back to no proxy for invalid values", () => {
    for (const value of ["true", "-1", "1.5", "abc"]) {
      expect(parseTrustProxyHops(value)).toBe(0);
    }
  });
});

describe("client IP behind a proxy", () => {
  it("ignores X-Forwarded-For when no proxy is trusted", async () => {
    const baseUrl = await startApp(undefined);
    expect(await clientIp(baseUrl, "203.0.113.7")).toMatch(/127\.0\.0\.1$/);
  });

  it("uses the address added by the trusted proxy, not one the client spoofed", async () => {
    const baseUrl = await startApp("1");
    // The client sent "198.51.100.1"; the proxy appended the real address "203.0.113.7".
    expect(await clientIp(baseUrl, "198.51.100.1, 203.0.113.7")).toBe("203.0.113.7");
  });
});

describe("startup warning about the hop count", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function warnedAboutHops(env, hops) {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    await startApp(hops);
    return warn.mock.calls.some(([message]) => message.startsWith("TRUST_PROXY_HOPS is unset"));
  }

  it.each([
    ["unset", undefined],
    ["zero", "0"],
    ["invalid", "abc"],
  ])("warns in production when the value is %s", async (_label, hops) => {
    expect(await warnedAboutHops({ NODE_ENV: "production" }, hops)).toBe(true);
  });

  it("stays quiet in production when a hop count is set", async () => {
    expect(await warnedAboutHops({ NODE_ENV: "production" }, "3")).toBe(false);
  });

  it("stays quiet in development", async () => {
    expect(await warnedAboutHops({ NODE_ENV: "development", ENV: "" }, undefined)).toBe(false);
  });
});

describe("Content-Security-Policy", () => {
  async function cspDirectives() {
    const baseUrl = await startApp(undefined);
    const header = (await fetch(`${baseUrl}/api/ip`)).headers.get("content-security-policy");
    return Object.fromEntries(
      header.split(";").map((d) => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values]),
    );
  }

  it("allows only same-origin scripts, with no 'unsafe-inline'", async () => {
    const directives = await cspDirectives();
    expect(directives["script-src"]).toEqual(["'self'"]);
  });

  it("blocks inline event handlers", async () => {
    const directives = await cspDirectives();
    expect(directives["script-src-attr"]).toEqual(["'none'"]);
  });
});

describe("global /api rate limit", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function apiLimit(env) {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const baseUrl = await startApp(undefined);
    return (await fetch(`${baseUrl}/api/ip`)).headers.get("ratelimit-limit");
  }

  it.each([
    ["production", { NODE_ENV: "production" }, "100"],
    ["no NODE_ENV", { NODE_ENV: "" }, "100"],
    ["ENV=prod alone", { NODE_ENV: "", ENV: "prod" }, "100"],
    ["ENV=prod with NODE_ENV=development", { NODE_ENV: "development", ENV: "prod" }, "100"],
    ["development", { NODE_ENV: "development", ENV: "" }, "1000"],
    ["tests", { NODE_ENV: "test", ENV: "" }, "1000"],
  ])("under %s", async (_label, env, limit) => {
    expect(await apiLimit(env)).toBe(limit);
  });
});

describe("local development origins", () => {
  const LOCAL_ORIGIN = "http://localhost:5173";
  const OWN_ORIGIN = "https://insight.example.com";

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function originCheck(env, origin) {
    vi.stubEnv("FRONTEND_URL", OWN_ORIGIN);
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const baseUrl = await startApp(undefined);
    const res = await fetch(`${baseUrl}/api/ip`, { method: "POST", headers: { Origin: origin } });
    return { status: res.status, allowOrigin: res.headers.get("access-control-allow-origin") };
  }

  it.each([
    ["production", { NODE_ENV: "production" }],
    ["no NODE_ENV", { NODE_ENV: "" }],
    ["ENV=prod", { NODE_ENV: "development", ENV: "prod" }],
  ])("are refused under %s", async (_label, env) => {
    expect(await originCheck(env, LOCAL_ORIGIN)).toEqual({ status: 403, allowOrigin: null });
  });

  it("are allowed in development", async () => {
    // 404: past the origin check, and this app has no POST route.
    expect(await originCheck({ NODE_ENV: "development", ENV: "" }, LOCAL_ORIGIN))
      .toEqual({ status: 404, allowOrigin: LOCAL_ORIGIN });
  });

  it("leave the public origin allowed in production", async () => {
    expect(await originCheck({ NODE_ENV: "production" }, OWN_ORIGIN))
      .toEqual({ status: 404, allowOrigin: OWN_ORIGIN });
  });
});

describe("apiNotFound", () => {
  // Same order as backend/index.js: API routes, then apiNotFound, then the SPA fallback.
  async function startSpaApp() {
    const app = express();
    app.get("/api/known", (req, res) => res.json({ ok: true }));
    app.use("/api", apiNotFound);
    app.get("*", (req, res) => res.type("html").send("<!doctype html>"));
    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    return `http://127.0.0.1:${server.address().port}`;
  }

  it("returns a JSON 404 for an unknown API path", async () => {
    const baseUrl = await startSpaApp();
    for (const path of ["/api/unknown", "/api/debug/client-ip", "/api"]) {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ detail: "Not found" });
    }
  });

  it("leaves known API routes and SPA pages alone", async () => {
    const baseUrl = await startSpaApp();
    expect((await fetch(`${baseUrl}/api/known`)).status).toBe(200);
    const page = await fetch(`${baseUrl}/hub`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toMatch(/html/);
  });
});

describe("spaFallbackLimiter", () => {
  // Same order as backend/index.js: the real middleware (trust proxy), then the limited fallback.
  async function startSpaApp() {
    process.env.TRUST_PROXY_HOPS = "1";
    const app = express();
    applyMiddleware(app);
    app.get("*", spaFallbackLimiter(), (req, res) => res.type("html").send("<!doctype html>"));
    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    return `http://127.0.0.1:${server.address().port}`;
  }

  function loadPage(baseUrl, clientIp) {
    return fetch(`${baseUrl}/hub`, { headers: { "X-Forwarded-For": clientIp } });
  }

  it("serves pages up to the limit, then returns 429 to that client only", async () => {
    const baseUrl = await startSpaApp();
    for (let n = 0; n < SPA_FALLBACK_LIMIT; n++) {
      const res = await loadPage(baseUrl, "203.0.113.7");
      expect(res.status).toBe(200);
      await res.arrayBuffer();
    }

    expect((await loadPage(baseUrl, "203.0.113.7")).status).toBe(429);
    expect((await loadPage(baseUrl, "198.51.100.9")).status).toBe(200);
  });
});

describe("jsonBody", () => {
  // Same order as backend/index.js: the body parser before the routes, errorHandler last.
  async function startEchoApp() {
    const app = express();
    app.use(jsonBody());
    app.post("/api/echo", (req, res) => res.json({ size: JSON.stringify(req.body).length }));
    app.use(errorHandler);
    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    return `http://127.0.0.1:${server.address().port}`;
  }

  function post(baseUrl, text) {
    return fetch(`${baseUrl}/api/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  }

  it("rejects a body over the limit with a 413 that names the limit", async () => {
    const baseUrl = await startEchoApp();
    const res = await post(baseUrl, "x".repeat(2 * 1024 * 1024 + 1));

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ detail: "Request body is too large. The maximum size is 2mb." });
  });

  it("accepts a body under the limit", async () => {
    const baseUrl = await startEchoApp();
    const res = await post(baseUrl, "x".repeat(1024 * 1024));

    expect(res.status).toBe(200);
  });
});
