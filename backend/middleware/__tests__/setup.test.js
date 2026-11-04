// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import {
  applyMiddleware,
  apiNotFound,
  jsonBody,
  maskAddress,
  parseTrustProxyHops,
  spaFallbackLimiter,
  SPA_FALLBACK_LIMIT,
} from "../setup.js";
import { errorHandler } from "../errorHandler.js";
import { logger } from "../../logger.js";
import healthRouter from "../../routes/health.js";

let server;

// App with the real middleware and one route that echoes the client IP seen by Express.
async function startApp(trustProxyHops) {
  if (trustProxyHops === undefined) delete process.env.TRUST_PROXY_HOPS;
  else process.env.TRUST_PROXY_HOPS = trustProxyHops;

  const app = express();
  applyMiddleware(app);
  app.get("/api/ip", (req, res) => res.json({ ip: req.ip }));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
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

describe("maskAddress", () => {
  it.each([
    ["203.0.113.7", "203.0.x.x"],
    ["::ffff:203.0.113.7", "203.0.x.x"],
    ["::FFFF:203.0.113.7", "203.0.x.x"],
    [" 203.0.113.7 ", "203.0.x.x"],
    ["2001:db8:1:2:3:4:5:6", "2001:db8:1:x"],
    ["2001:db8::1", "2001:db8:x"],
    ["2001::1", "2001:x"],
    ["::1", "::x"],
    ["::ffff:cb00:7107", "::x"],
    ["fe80::1%eth0", "fe80:x"],
  ])("masks %s", (address, masked) => {
    expect(maskAddress(address)).toBe(masked);
  });

  it.each(["", "not-an-address", "203.0.113.7:8080", "<script>", "203.0.113"])(
    "does not repeat %j",
    (value) => {
      expect(maskAddress(value)).toBe("invalid");
    },
  );
});

describe("TRUST_PROXY_DIAGNOSTIC", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  let warn;

  async function startHealthApp(hops, switchValue) {
    if (switchValue !== undefined) vi.stubEnv("TRUST_PROXY_DIAGNOSTIC", switchValue);
    process.env.TRUST_PROXY_HOPS = hops;
    warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const app = express();
    applyMiddleware(app);
    app.use(healthRouter);
    app.post("/health", (req, res) => res.json({ ok: true }));
    app.get("/other", (req, res) => res.json({ ok: true }));
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    return `http://127.0.0.1:${server.address().port}`;
  }

  function checks() {
    return warn.mock.calls.filter(([message]) => message === "client-ip-check").map(([, meta]) => meta);
  }

  function check(baseUrl, forwardedFor) {
    const headers = forwardedFor ? { "X-Forwarded-For": forwardedFor } : {};
    return fetch(`${baseUrl}/health?ipcheck`, { headers });
  }

  it("logs nothing when the switch is unset", async () => {
    const baseUrl = await startHealthApp("3");
    await check(baseUrl, "203.0.113.7, 198.51.100.2, 198.51.100.3");
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(["", "1", "TRUE", "false", "on"])("stays off with the value %j", async (value) => {
    const baseUrl = await startHealthApp("3", value);
    await check(baseUrl, "203.0.113.7, 198.51.100.2, 198.51.100.3");
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns at startup when it is on", async () => {
    await startHealthApp("3", "true");
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^TRUST_PROXY_DIAGNOSTIC is on/));
  });

  it("logs only GET /health?ipcheck", async () => {
    const baseUrl = await startHealthApp("3", "true");
    await fetch(`${baseUrl}/health`);
    await fetch(`${baseUrl}/health?other`);
    await fetch(`${baseUrl}/other?ipcheck`);
    await fetch(`${baseUrl}/health?ipcheck`, { method: "POST" });
    await fetch(`${baseUrl}/health?ipcheck`, { method: "HEAD" });
    expect(checks()).toEqual([]);

    await check(baseUrl);
    expect(checks()).toHaveLength(1);
  });

  async function healthResponse(path, switchValue) {
    const baseUrl = await startHealthApp("3", switchValue);
    const res = await fetch(`${baseUrl}${path}`);
    const headers = Object.fromEntries(res.headers);
    delete headers.date;
    const response = { status: res.status, headers, body: await res.text() };
    await new Promise((resolve) => server.close(resolve));
    server = undefined;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    return response;
  }

  it.each(["/health", "/health?ipcheck"])("does not change the response of %s", async (path) => {
    const off = await healthResponse(path);
    const on = await healthResponse(path, "true");
    expect(on).toEqual(off);
    expect(on.status).toBe(200);
    expect(on.body).toBe('{"ok":true}');
  });

  it("marks only the ?ipcheck variant as not cacheable", async () => {
    for (const switchValue of [undefined, "true"]) {
      const plain = await healthResponse("/health", switchValue);
      const variant = await healthResponse("/health?ipcheck", switchValue);
      expect(plain.headers["cache-control"]).toBeUndefined();
      expect(variant.headers["cache-control"]).toBe("no-store");
    }
  });

  it("never logs a full address or a raw header value", async () => {
    const baseUrl = await startHealthApp("3", "true");
    await check(baseUrl, "secret-token, 2001:db8::1234, 203.0.113.7, 198.51.100.2, 192.0.2.3");

    const logged = JSON.stringify(warn.mock.calls);
    for (const raw of ["secret-token", "1234", "113.7", "100.2", "2.3"]) {
      expect(logged).not.toContain(raw);
    }
    expect(checks()[0].forwardedFor).toEqual(["invalid", "2001:db8:x", "203.0.x.x", "198.51.x.x", "192.0.x.x"]);
  });

  it("masks the address of a request with no header", async () => {
    const baseUrl = await startHealthApp("3", "true");
    await check(baseUrl);
    expect(checks()[0]).toEqual({ trustProxyHops: 3, entryCount: 0, clientIp: "127.0.x.x", forwardedFor: [] });
  });

  it("prints at most 10 entries, the rightmost, and still counts all of them", async () => {
    const baseUrl = await startHealthApp("3", "true");
    const fakes = Array.from({ length: 20 }, (_, n) => `198.51.${n}.1`);
    await check(baseUrl, [...fakes, "203.0.113.7"].join(", "));

    const { entryCount, forwardedFor } = checks()[0];
    expect(entryCount).toBe(21);
    expect(forwardedFor).toHaveLength(10);
    expect(forwardedFor.at(-1)).toBe("203.0.x.x");
    expect(forwardedFor[0]).toBe("198.51.x.x");
  });

  describe("outcomes with 3 hops", () => {
    const CLIENT = "203.0.113.7";
    const FAKE = "198.51.100.1";

    async function outcome(forwardedFor) {
      const baseUrl = await startHealthApp("3", "true");
      await check(baseUrl, forwardedFor);
      const { entryCount, clientIp } = checks()[0];
      return { entryCount, clientIp };
    }

    it("correct: a real request finds the client", async () => {
      expect(await outcome(`${CLIENT}, 192.0.2.1, 192.0.2.2`))
        .toEqual({ entryCount: 3, clientIp: "203.0.x.x" });
    });

    it("correct: a fake entry does not move the client", async () => {
      expect(await outcome(`${FAKE}, ${CLIENT}, 192.0.2.1, 192.0.2.2`))
        .toEqual({ entryCount: 4, clientIp: "203.0.x.x" });
    });

    it("too high: a real request still looks right", async () => {
      expect(await outcome(`${CLIENT}, 192.0.2.1`))
        .toEqual({ entryCount: 2, clientIp: "203.0.x.x" });
    });

    it("too high: a fake entry becomes the client", async () => {
      expect(await outcome(`${FAKE}, ${CLIENT}, 192.0.2.1`))
        .toEqual({ entryCount: 3, clientIp: "198.51.x.x" });
    });

    it("too low: every request gets a proxy address", async () => {
      expect(await outcome(`${CLIENT}, 192.0.2.1, 192.0.2.2, 192.0.2.3`))
        .toEqual({ entryCount: 4, clientIp: "192.0.x.x" });
    });
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
      server = app.listen(0, resolve);
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
      server = app.listen(0, resolve);
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
      server = app.listen(0, resolve);
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
