// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import bcrypt from "bcryptjs";

const { User } = vi.hoisted(() => ({ User: { findOne: vi.fn() } }));
vi.mock("../models.js", () => ({ User }));

const PASSWORD = "correct-password";
const user = { email: "a@example.com", role: "viewer", password_hash: bcrypt.hashSync(PASSWORD, 4) };

let server;
let baseUrl;

// A fresh router module per test, so each test starts with an empty limiter.
beforeEach(async () => {
  vi.resetModules();
  User.findOne.mockImplementation(async ({ email }) => (email === user.email ? user : null));
  const { default: authRouter } = await import("../auth.js");
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => new Promise((resolve) => server.close(resolve)));

const login = (password) =>
  fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password }),
  });

describe("POST /api/auth/login rate limit", () => {
  it("blocks the 11th failed attempt within the window", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await login("wrong-password")).status).toBe(401);
    }
    const blocked = await login("wrong-password");
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).detail).toMatch(/too many failed attempts/i);
  });

  it("blocks even the correct password once the limit is reached", async () => {
    for (let i = 0; i < 10; i++) await login("wrong-password");
    expect((await login(PASSWORD)).status).toBe(429);
  });

  it("does not count successful logins", async () => {
    for (let i = 0; i < 12; i++) {
      expect((await login(PASSWORD)).status).toBe(200);
    }
    expect((await login("wrong-password")).status).toBe(401);
  });
});
