// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

const USERS = {
  "demo@demo.invalid": { _id: "demo-1", email: "demo@demo.invalid", role: "demo" },
  "admin@corp.example": { _id: "admin-1", email: "admin@corp.example", role: "admin" },
  "viewer@corp.example": { _id: "viewer-1", email: "viewer@corp.example", role: "viewer" },
};

const { User, removeDemoWorkspace, logger } = vi.hoisted(() => ({
  User: { findOne: vi.fn() },
  removeDemoWorkspace: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("../models.js", () => ({ User }));
vi.mock("../logger.js", () => ({ logger }));
vi.mock("../demo.js", () => ({ createDemoWorkspace: vi.fn(), removeDemoWorkspace }));

import authRouter from "../auth.js";

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
  User.findOne.mockImplementation(async ({ email }) => USERS[email] ?? null);
  removeDemoWorkspace.mockResolvedValue(1);
});

const tokenFor = (email) => jwt.sign({ sub: email, role: USERS[email].role }, "dev-secret-change-me");

function logout(cookie) {
  return fetch(`${base}/api/auth/logout`, {
    method: "POST",
    headers: cookie ? { Cookie: `access_token=${cookie}` } : {},
  });
}

async function expectLoggedOut(res) {
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(res.headers.get("set-cookie")).toMatch(/^access_token=;/);
}

describe("POST /api/auth/logout", () => {
  it("removes the demo user's workspace right away", async () => {
    await expectLoggedOut(await logout(tokenFor("demo@demo.invalid")));

    expect(removeDemoWorkspace).toHaveBeenCalledTimes(1);
    expect(removeDemoWorkspace).toHaveBeenCalledWith("demo-1");
    expect(logger.info).toHaveBeenCalledWith("Removed demo workspace on logout");
    expect(JSON.stringify(logger.info.mock.calls)).not.toMatch(/demo-1|demo@demo/);
  });

  it("never removes an admin or a viewer", async () => {
    await expectLoggedOut(await logout(tokenFor("admin@corp.example")));
    await expectLoggedOut(await logout(tokenFor("viewer@corp.example")));

    expect(removeDemoWorkspace).not.toHaveBeenCalled();
  });

  it("clears the cookie without a token or with an invalid one, and removes nothing", async () => {
    await expectLoggedOut(await logout());
    await expectLoggedOut(await logout("not-a-jwt"));
    await expectLoggedOut(await logout(jwt.sign({ sub: "demo@demo.invalid", role: "demo" }, "wrong-secret")));

    expect(removeDemoWorkspace).not.toHaveBeenCalled();
  });

  it("still logs out when removing the workspace fails", async () => {
    removeDemoWorkspace.mockRejectedValue(new Error("db hiccup"));

    await expectLoggedOut(await logout(tokenFor("demo@demo.invalid")));
    expect(logger.error).toHaveBeenCalledWith("Demo removal on logout failed", { message: "db hiccup" });
  });
});
