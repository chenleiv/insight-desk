// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import bcrypt from "bcryptjs";

const { User } = vi.hoisted(() => ({ User: { findOne: vi.fn() } }));
vi.mock("../models.js", () => ({ User }));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const PASSWORD = "correct-password";
const SHORT_PASSWORD = "abc123";
const accounts = {
  "victim@example.com": { email: "victim@example.com", role: "admin", favorites: [], password_hash: bcrypt.hashSync(PASSWORD, 4) },
  "short@example.com": { email: "short@example.com", role: "viewer", favorites: [], password_hash: bcrypt.hashSync(SHORT_PASSWORD, 4) },
  "google@example.com": { email: "google@example.com", role: "viewer", favorites: [], password_hash: null },
};

let server;
let baseUrl;

// A fresh router module per test, so each test starts with empty limiters.
beforeEach(async () => {
  vi.resetModules();
  User.findOne.mockImplementation(async ({ email }) => accounts[email] ?? null);
  const { default: authRouter } = await import("../auth.js");
  const app = express();
  // One trusted hop, so each test request can act as a different client address.
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/api/auth", authRouter);
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise((resolve) => server.close(resolve));
});

const login = (email, password, address = "10.0.0.1") =>
  fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": address },
    body: JSON.stringify({ email, password }),
  });

// Each attempt from its own address, so the per-address limit never applies.
async function failFromManyAddresses(email, times) {
  for (let i = 0; i < times; i++) {
    expect((await login(email, "wrong-password", `10.1.0.${i + 1}`)).status).toBe(401);
  }
}

describe("existing passwords", () => {
  it("still log in when shorter than the new minimum", async () => {
    expect((await login("short@example.com", SHORT_PASSWORD)).status).toBe(200);
  });
});

describe("login timing", () => {
  it.each([
    ["an unknown email", "nobody@example.com"],
    ["an account without a password", "google@example.com"],
  ])("still runs a full cost bcrypt comparison for %s", async (_label, email) => {
    const compare = vi.spyOn(bcrypt, "compare");

    expect((await login(email, "any-password")).status).toBe(401);

    expect(compare).toHaveBeenCalledOnce();
    const [password, hash] = compare.mock.calls[0];
    expect(password).toBe("any-password");
    expect(bcrypt.getRounds(hash)).toBe(10);
  });

  it("gives the same answer for an unknown email and a wrong password", async () => {
    const unknown = await login("nobody@example.com", "any-password");
    const wrong = await login("victim@example.com", "any-password", "10.0.0.2");

    expect(unknown.status).toBe(wrong.status);
    expect(await unknown.json()).toEqual(await wrong.json());
  });

  it("never signs in to an account without a password, whatever is sent", async () => {
    expect((await login("google@example.com", "correct-password")).status).toBe(401);
  });
});

describe("the per-account limit", () => {
  it("blocks the 21st failed attempt on one account across many addresses", async () => {
    await failFromManyAddresses("victim@example.com", 20);

    const blocked = await login("victim@example.com", "wrong-password", "10.2.0.1");
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).detail).toMatch(/too many failed attempts/i);
  });

  it("counts different spellings of an address as one account", async () => {
    await failFromManyAddresses("Victim@Example.com", 20);

    expect((await login("victim@example.com", PASSWORD, "10.2.0.1")).status).toBe(429);
  });

  it("leaves other accounts alone", async () => {
    await failFromManyAddresses("victim@example.com", 20);

    expect((await login("short@example.com", SHORT_PASSWORD, "10.2.0.1")).status).toBe(200);
  });

  it("does not count successful logins", async () => {
    for (let i = 0; i < 25; i++) {
      expect((await login("victim@example.com", PASSWORD, `10.3.0.${i + 1}`)).status).toBe(200);
    }
  });

  it("treats unknown addresses the same, so the limit reveals nothing", async () => {
    await failFromManyAddresses("nobody@example.com", 20);

    expect((await login("nobody@example.com", "wrong-password", "10.2.0.1")).status).toBe(429);
  });

  it("leaves a body without an email to the validation error", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "x" }),
    });

    expect(res.status).toBe(400);
  });
});
