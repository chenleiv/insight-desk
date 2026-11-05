// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";

const { User, limiterOptions } = vi.hoisted(() => ({ User: { findOne: vi.fn() }, limiterOptions: [] }));
vi.mock("../models.js", () => ({ User }));
vi.mock("groq-sdk", () => ({ default: class {} }));
// The real limiter, with a record of how each one was configured.
vi.mock("express-rate-limit", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: (options) => {
      limiterOptions.push(options);
      return actual.default(options);
    },
  };
});

beforeEach(() => {
  vi.resetModules();
  limiterOptions.length = 0;
});

describe("limiter configuration", () => {
  it("gives every per-address limiter the shared prefix", async () => {
    const { IPV6_PREFIX } = await import("../clientAddress.js");
    const { applyMiddleware, spaFallbackLimiter } = await import("../middleware/setup.js");
    await Promise.all([import("../auth.js"), import("../ai.js"), import("../routes/documents.js")]);
    applyMiddleware(express());
    spaFallbackLimiter();

    const perAddress = limiterOptions.filter((options) => !options.keyGenerator);

    // API, SPA fallback, password attempts, demo creation, chat, feedback, quality, uploads.
    expect(perAddress).toHaveLength(8);
    expect(perAddress.map((options) => options.ipv6Subnet)).toEqual(Array(8).fill(IPV6_PREFIX));
  });

  it("keeps the per-account limiter on its own key, with no address in it", async () => {
    await import("../auth.js");

    const perAccount = limiterOptions.filter((options) => options.keyGenerator);

    expect(perAccount).toHaveLength(1);
    expect(perAccount[0].ipv6Subnet).toBeUndefined();
    const key = perAccount[0].keyGenerator({ body: { email: "a@example.com" }, ip: "2001:db8::1" });
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});

// The password limiter, as the lowest limit that a test can reach over real HTTP.
describe("a limiter behind a proxy", () => {
  const LIMIT = 10;
  let server;
  let baseUrl;

  beforeEach(async () => {
    User.findOne.mockResolvedValue(null);
    const { default: authRouter } = await import("../auth.js");
    const app = express();
    // One trusted hop, so each test request can act as a different client address.
    app.set("trust proxy", 1);
    app.use(express.json());
    app.use("/api/auth", authRouter);
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(() => new Promise((resolve) => server.close(resolve)));

  // A new email each time, so only the per-address limit can apply.
  let attempt = 0;
  const failLogin = (address) =>
    fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": address },
      body: JSON.stringify({ email: `user${attempt++}@example.com`, password: "wrong-password" }),
    });

  async function reachLimit(addressAt) {
    for (let i = 0; i < LIMIT; i++) {
      expect((await failLogin(addressAt(i))).status).toBe(401);
    }
  }

  it("counts addresses in one /64 as one client", async () => {
    await reachLimit((i) => `2001:db8:1:2:${i + 1}::1`);

    expect((await failLogin("2001:db8:1:2:ffff::1")).status).toBe(429);
  });

  it("counts different /64 networks in one /56 as one client", async () => {
    await reachLimit((i) => `2001:db8:1:${i + 1}::1`);

    expect((await failLogin("2001:db8:1:ff::1")).status).toBe(429);
  });

  it("counts another /56 separately", async () => {
    await reachLimit(() => "2001:db8:1::1");

    expect((await failLogin("2001:db8:1:100::1")).status).toBe(401);
  });

  it("keeps counting each IPv4 address separately", async () => {
    await reachLimit(() => "203.0.113.7");

    expect((await failLogin("203.0.113.7")).status).toBe(429);
    expect((await failLogin("203.0.113.8")).status).toBe(401);
  });

  it("counts an IPv4-mapped address as its IPv4 address", async () => {
    await reachLimit(() => "203.0.113.7");

    expect((await failLogin("::ffff:203.0.113.7")).status).toBe(429);
  });

  it("still answers an invalid address, which counts on its own", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await reachLimit(() => "not-an-ip");

    expect((await failLogin("not-an-ip")).status).toBe(429);
    expect((await failLogin("203.0.113.7")).status).toBe(401);
    consoleError.mockRestore();
  });
});
