// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { startMongoServer } from "./mongoMemory.js";

// No env file is loaded.
vi.mock("../loadEnv.js", () => ({}));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { User } from "../models.js";
import authRouter from "../auth.js";
import { maskEmail, parseMode, runEmailMigration } from "../scripts/normalizeEmails.js";

// Runs against a real in-memory MongoDB. Inserts skip the model, whose lowercase
// setter would otherwise fix the very data this script exists for.
let mongo;
let server;
let base;

beforeAll(async () => {
  mongo = await startMongoServer();
  await mongoose.connect(mongo.getUri());
  await User.syncIndexes();
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(() => User.deleteMany({}));

const insert = (...emails) =>
  User.collection.insertMany(emails.map((email) => ({ email, role: "viewer", createdAt: new Date(0) })));

const storedEmails = async () =>
  (await User.collection.find({}).toArray()).map((u) => u.email).sort();

const silentRun = (dryRun) => {
  const lines = [];
  return runEmailMigration({ dryRun, log: (line) => lines.push(line) }).then((result) => ({ result, lines }));
};

describe("parseMode", () => {
  it.each([
    [["--dry-run"], "dry-run"],
    [["--apply"], "apply"],
    [[], null],
    [["--dry-run", "--apply"], null],
    [["--other"], null],
  ])("%j gives %s", (args, mode) => {
    expect(parseMode(args)).toBe(mode);
  });
});

describe("runEmailMigration", () => {
  it("writes nothing in a dry run and reports what it would do", async () => {
    await insert("Mixed@Example.com", "lower@example.com");

    const { result, lines } = await silentRun(true);

    expect(result).toMatchObject({ total: 2, toRewrite: 1, updated: 0, collisions: 0 });
    expect(await storedEmails()).toEqual(["Mixed@Example.com", "lower@example.com"]);
    expect(lines.join("\n")).toContain("would rewrite");
  });

  it("lowercases emails when applied, and a second run changes nothing", async () => {
    await insert("Mixed@Example.com", "lower@example.com");

    expect((await silentRun(false)).result).toMatchObject({ toRewrite: 1, updated: 1 });
    expect(await storedEmails()).toEqual(["lower@example.com", "mixed@example.com"]);

    expect((await silentRun(false)).result).toMatchObject({ toRewrite: 0, updated: 0 });
  });

  it("reports colliding addresses and leaves them untouched, while fixing the others", async () => {
    await insert("Same@Example.com", "same@example.com", "Other@Example.com");

    const { result, lines } = await silentRun(false);

    expect(result).toMatchObject({ collisions: 1, updated: 1, failed: 0 });
    expect(await storedEmails()).toEqual(["Same@Example.com", "other@example.com", "same@example.com"]);
    expect(lines.join("\n")).toContain("COLLISION");
  });

  it("prints no full address", async () => {
    await insert("Same@Example.com", "same@example.com", "Other@Example.com");

    const { lines } = await silentRun(true);

    expect(lines.join("\n")).not.toMatch(/same@|other@/i);
    expect(maskEmail("other@example.com")).toBe("o***@example.com");
  });
});

describe("the User model", () => {
  it("can still save other changes on an account stored in mixed case", async () => {
    await insert("Mixed@Example.com");
    const user = await User.findOne({ email: "Mixed@Example.com" });

    user.displayName = "Mixed";
    await user.save();

    expect(await storedEmails()).toEqual(["Mixed@Example.com"]);
  });
});

describe("an account stored in mixed case, on the real model", () => {
  const PASSWORD = "existing-password";

  const login = (email) =>
    fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });

  const sessionCookie = (res) => res.headers.getSetCookie()[0].split(";")[0];

  beforeEach(() =>
    User.collection.insertOne({
      email: "Owner@Example.com",
      role: "admin",
      password_hash: bcrypt.hashSync(PASSWORD, 4),
    }));

  it("logs in and keeps a working session before the migration", async () => {
    const res = await login("Owner@Example.com");
    expect(res.status).toBe(200);

    const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie: sessionCookie(res) } });
    expect(me.status).toBe(200);
    expect((await me.json()).role).toBe("admin");
  });

  it("logs in with any case after the migration", async () => {
    await silentRun(false);

    expect((await login("Owner@Example.com")).status).toBe(200);
    expect((await login("owner@example.com")).status).toBe(200);
  });
});
