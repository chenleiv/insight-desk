// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import bcrypt from "bcryptjs";

// In-memory stand-in for the users collection.
const { User, users } = vi.hoisted(() => {
  const users = [];
  const User = {
    countDocuments: vi.fn(async () => users.length),
    create: vi.fn(async (input) => {
      const created = [input].flat().map((u) => ({ status: "active", ...u }));
      users.push(...created);
      return Array.isArray(input) ? created : created[0];
    }),
    findOne: vi.fn(async ({ email }) => users.find((u) => u.email === email) ?? null),
  };
  return { User, users };
});
vi.mock("../models.js", () => ({ User }));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

let server;
let baseUrl;
let seedUsersIfEmpty;

// A fresh router module per test, so the login rate limiter starts empty.
beforeEach(async () => {
  users.length = 0;
  vi.resetModules();
  vi.stubEnv("ADMIN_EMAIL", "");
  vi.stubEnv("ADMIN_PASSWORD", "");
  const auth = await import("../auth.js");
  seedUsersIfEmpty = auth.seedUsersIfEmpty;
  const app = express();
  app.use(express.json());
  app.use("/api/auth", auth.default);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await new Promise((resolve) => server.close(resolve));
});

const login = (email, password) =>
  fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

describe("demo accounts", () => {
  it.each([
    ["admin@demo.com", "admin123"],
    ["viewer@demo.com", "viewer123"],
  ])("cannot log in as %s after seeding an empty database", async (email, password) => {
    await seedUsersIfEmpty();

    expect((await login(email, password)).status).toBe(401);
  });
});

describe("seeding the first admin", () => {
  it("creates no users when ADMIN_EMAIL and ADMIN_PASSWORD are not set", async () => {
    await seedUsersIfEmpty();

    expect(users).toHaveLength(0);
  });

  it("creates one admin from ADMIN_EMAIL and ADMIN_PASSWORD who can log in", async () => {
    vi.stubEnv("ADMIN_EMAIL", "owner@example.com");
    vi.stubEnv("ADMIN_PASSWORD", "env-admin-password");

    await seedUsersIfEmpty();

    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: "owner@example.com", role: "admin" });
    const res = await login("owner@example.com", "env-admin-password");
    expect(res.status).toBe(200);
    expect((await res.json()).user.role).toBe("admin");
  });
});

describe("inactive users", () => {
  const PASSWORD = "inactive-password";

  beforeEach(async () => {
    users.push({
      email: "former@example.com",
      role: "viewer",
      status: "inactive",
      password_hash: await bcrypt.hash(PASSWORD, 4),
    });
  });

  it("cannot log in with the correct password", async () => {
    const res = await login("former@example.com", PASSWORD);

    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("gets the generic 401 with a wrong password, so the status is not revealed", async () => {
    expect((await login("former@example.com", "wrong-password")).status).toBe(401);
  });
});

describe("login validation errors", () => {
  it("returns the validation messages to the client without echoing the input", async () => {
    const res = await login("SECR-EMAIL", "SECR");
    const body = await res.text();

    expect(res.status).toBe(400);
    expect(JSON.parse(body)).toEqual({
      detail: "Validation failed",
      errors: [
        { path: ["email"], message: "Invalid email format" },
        { path: ["password"], message: "Password must be at least 6 characters" },
      ],
    });
    expect(body).not.toContain("SECR");
  });
});
