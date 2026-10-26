// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import { applyMiddleware, parseTrustProxyHops } from "../setup.js";

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
