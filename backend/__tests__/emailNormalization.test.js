// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import bcrypt from "bcryptjs";

// In-memory stand-in for the users collection. Lookups are exact, like the real unique index.
const { User, users } = vi.hoisted(() => {
  const users = [];
  const User = {
    countDocuments: vi.fn(async () => users.length),
    create: vi.fn(async (input) => {
      users.push(input);
      return input;
    }),
    findOne: vi.fn(async ({ email }) => users.find((u) => u.email === email) ?? null),
  };
  return { User, users };
});
vi.mock("../models.js", () => ({ User }));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const PASSWORD = "correct-password";
let server;
let baseUrl;
let seedUsersIfEmpty;

beforeEach(async () => {
  users.length = 0;
  vi.resetModules();
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

const login = (email, password = PASSWORD) =>
  fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

const addUser = (email) =>
  users.push({ email, role: "viewer", password_hash: bcrypt.hashSync(PASSWORD, 4) });

describe("login email case", () => {
  it("finds a lowercase account whatever case is typed", async () => {
    addUser("owner@example.com");

    expect((await login("Owner@Example.COM")).status).toBe(200);
    expect((await login("  owner@example.com ")).status).toBe(200);
  });

  it("still lets an account stored in mixed case log in before the migration", async () => {
    addUser("Owner@Example.com");

    expect((await login("Owner@Example.com")).status).toBe(200);
  });

  it("does not look up a second spelling when the typed email is already normalized", async () => {
    expect((await login("nobody@example.com")).status).toBe(401);
    expect(User.findOne).toHaveBeenLastCalledWith({ email: "nobody@example.com" });
    expect(users).toHaveLength(0);
  });

  it("rejects a wrong password for a mixed-case account", async () => {
    addUser("Owner@Example.com");

    expect((await login("Owner@Example.com", "wrong-password")).status).toBe(401);
  });
});

describe("seeding the first admin", () => {
  it("stores ADMIN_EMAIL in lowercase", async () => {
    vi.stubEnv("ADMIN_EMAIL", "Owner@Example.COM");
    vi.stubEnv("ADMIN_PASSWORD", "env-admin-password");

    await seedUsersIfEmpty();

    expect(users[0].email).toBe("owner@example.com");
    expect((await login("owner@example.com", "env-admin-password")).status).toBe(200);
  });
});
