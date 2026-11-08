// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const { User } = vi.hoisted(() => ({ User: { findOne: vi.fn() } }));
vi.mock("../models.js", () => ({ User }));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import authRouter from "../auth.js";

const PASSWORD = "current-password";
let user;
let server;
let base;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  vi.clearAllMocks();
  user = { email: "a@example.com", role: "viewer", password_hash: bcrypt.hashSync(PASSWORD, 4), save: vi.fn() };
  User.findOne.mockImplementation(async ({ email }) => (email === user.email ? user : null));
});

const token = () => jwt.sign({ sub: user.email, role: user.role }, "dev-secret-change-me");

const changePassword = (body, cookie = `access_token=${token()}`) =>
  fetch(`${base}/api/auth/password`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: JSON.stringify(body),
  });

describe("PATCH /api/auth/password", () => {
  it("answers a wrong current password with 400 and a clear message", async () => {
    const res = await changePassword({ currentPassword: "wrong-password", newPassword: "new-password" });

    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe("Current password is incorrect");
    expect(user.save).not.toHaveBeenCalled();
  });

  it("changes the password when the current one is correct", async () => {
    const res = await changePassword({ currentPassword: PASSWORD, newPassword: "new-password" });

    expect(res.status).toBe(200);
    expect(user.save).toHaveBeenCalledOnce();
    expect(await bcrypt.compare("new-password", user.password_hash)).toBe(true);
  });

  it.each([
    ["11 characters", "x".repeat(11)],
    ["more than 72 bytes", "x".repeat(73)],
    ["more than 72 bytes in fewer characters", "é".repeat(37)],
  ])("refuses a new password of %s", async (_label, newPassword) => {
    const res = await changePassword({ currentPassword: PASSWORD, newPassword });

    expect(res.status).toBe(400);
    expect(user.save).not.toHaveBeenCalled();
  });

  it.each([
    ["exactly 12 characters", "x".repeat(12)],
    ["exactly 72 bytes", "x".repeat(72)],
    ["no mix of character types", "aaaaaaaaaaaaaaaa"],
  ])("accepts a new password of %s", async (_label, newPassword) => {
    expect((await changePassword({ currentPassword: PASSWORD, newPassword })).status).toBe(200);
  });

  it("answers a request without a session with 401", async () => {
    const res = await changePassword({ currentPassword: PASSWORD, newPassword: "new-password" }, null);

    expect(res.status).toBe(401);
  });

  it.each([
    [{ newPassword: "new-password" }],
    [{ currentPassword: PASSWORD, newPassword: "short" }],
    [{ currentPassword: PASSWORD, newPassword: ["a", "b", "c", "d", "e", "f"] }],
  ])("rejects an invalid body %j with 400", async (body) => {
    const res = await changePassword(body);

    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe("Validation failed");
    expect(user.save).not.toHaveBeenCalled();
  });
});
