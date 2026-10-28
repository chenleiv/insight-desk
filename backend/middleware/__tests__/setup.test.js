// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import { applyMiddleware, apiNotFound, jsonBody, parseTrustProxyHops } from "../setup.js";
import { errorHandler } from "../errorHandler.js";

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

  it("rejects a body over the limit with a generic 413", async () => {
    const baseUrl = await startEchoApp();
    const res = await post(baseUrl, "x".repeat(2 * 1024 * 1024 + 1));

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ detail: "Request body too large" });
  });

  it("accepts a body under the limit", async () => {
    const baseUrl = await startEchoApp();
    const res = await post(baseUrl, "x".repeat(1024 * 1024));

    expect(res.status).toBe(200);
  });
});
