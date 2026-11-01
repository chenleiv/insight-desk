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
    server = app.listen(0, resolve);
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
