// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { startMongoServer } from "./mongoMemory.js";

vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { User } from "../models.js";
import authRouter from "../auth.js";
import usersRouter from "../routes/users.js";

// Runs against a real in-memory MongoDB, so the $inc updates are exercised for real.
const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const PASSWORD = "current-password";
const EMAIL = "alice@example.com";

let mongo;
let server;
let base;

beforeAll(async () => {
  mongo = await startMongoServer();
  await mongoose.connect(mongo.getUri());
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
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

beforeEach(async () => {
  await User.deleteMany({});
  await User.create({ email: EMAIL, role: "viewer", password_hash: bcrypt.hashSync(PASSWORD, 4) });
});

const sessionCookie = (res) => res.headers.getSetCookie()[0].split(";")[0];

async function login() {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  expect(res.status).toBe(200);
  return sessionCookie(res);
}

const me = (cookie) => fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } });
const logout = (cookie) => fetch(`${base}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie } });

describe("token version", () => {
  it("ends a session on logout, so a copy of the old cookie no longer works", async () => {
    const cookie = await login();
    expect((await me(cookie)).status).toBe(200);

    await logout(cookie);

    const res = await me(cookie);
    expect(res.status).toBe(401);
    expect((await res.json()).detail).toBe("Session ended");
  });

  it("ends the user's other sessions on logout", async () => {
    const first = await login();
    const second = await login();

    await logout(first);

    expect((await me(second)).status).toBe(401);
  });

  it("does not let an already ended token end the newer session", async () => {
    const old = await login();
    await logout(old);
    const current = await login();

    await logout(old);

    expect((await me(current)).status).toBe(200);
  });

  it("ends other sessions on a password change and keeps the current one on a new cookie", async () => {
    const other = await login();
    const current = await login();

    const res = await fetch(`${base}/api/auth/password`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: current },
      body: JSON.stringify({ currentPassword: PASSWORD, newPassword: "a-brand-new-password" }),
    });
    expect(res.status).toBe(200);

    expect((await me(other)).status).toBe(401);
    expect((await me(current)).status).toBe(401);
    expect((await me(sessionCookie(res))).status).toBe(200);
  });

  it("keeps a token issued before token versions existed valid until the first bump", async () => {
    const legacy = `access_token=${jwt.sign({ sub: EMAIL, role: "viewer" }, SECRET)}`;
    expect((await me(legacy)).status).toBe(200);

    await logout(await login());

    expect((await me(legacy)).status).toBe(401);
  });

  it("does not bring a session back when a disabled user is re-enabled", async () => {
    const cookie = await login();
    const admin = await User.create({ email: "admin@example.com", role: "admin" });
    const adminCookie = `access_token=${jwt.sign({ sub: admin.email, role: "admin" }, SECRET)}`;
    const target = await User.findOne({ email: EMAIL });
    const setStatus = (status) =>
      fetch(`${base}/api/users/${target._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ status }),
      });

    expect((await setStatus("inactive")).status).toBe(200);
    expect((await setStatus("active")).status).toBe(200);

    expect((await User.findOne({ email: EMAIL })).status).toBe("active");
    expect((await me(cookie)).status).toBe(401);
    expect((await me(await login())).status).toBe(200);
  });
});
