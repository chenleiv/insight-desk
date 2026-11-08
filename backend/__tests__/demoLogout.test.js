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
  User: { findOne: vi.fn(), updateOne: vi.fn() },
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

async function expectStillSignedIn(res) {
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ detail: "Could not sign out. Please try again." });
  expect(res.headers.get("set-cookie")).toBeNull();
}

function expectLogSafe(token) {
  expect(logger.error).toHaveBeenCalledWith("Ending sessions on logout failed", { error: "Error" });
  const logged = JSON.stringify([logger.error.mock.calls, logger.info.mock.calls, logger.warn.mock.calls]);
  expect(logged).not.toContain(token);
  expect(logged).not.toMatch(/corp\.example|demo\.invalid|demo-1|viewer-1/);
}

// A database message can quote the values of the query.
const dbError = (email) => new Error(`write failed for ${email}`);

describe("POST /api/auth/logout", () => {
  it("ends a regular user's sessions before clearing the cookie", async () => {
    await expectLoggedOut(await logout(tokenFor("viewer@corp.example")));

    expect(User.updateOne).toHaveBeenCalledWith({ _id: "viewer-1" }, { $inc: { tokenVersion: 1 } });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("reports failure and keeps the cookie when raising the token version fails", async () => {
    const token = tokenFor("viewer@corp.example");
    User.updateOne.mockRejectedValueOnce(dbError("viewer@corp.example"));

    await expectStillSignedIn(await logout(token));
    expectLogSafe(token);
  });

  it("reports failure and keeps the cookie when the user lookup fails", async () => {
    const token = tokenFor("viewer@corp.example");
    User.findOne.mockRejectedValueOnce(dbError("viewer@corp.example"));

    await expectStillSignedIn(await logout(token));
    expect(User.updateOne).not.toHaveBeenCalled();
    expectLogSafe(token);
  });

  it("succeeds on a retry after a failure", async () => {
    const token = tokenFor("viewer@corp.example");
    User.updateOne.mockRejectedValueOnce(dbError("viewer@corp.example"));

    await expectStillSignedIn(await logout(token));
    await expectLoggedOut(await logout(token));
  });

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

  it("reports failure and keeps the cookie when removing the workspace fails", async () => {
    const token = tokenFor("demo@demo.invalid");
    removeDemoWorkspace.mockRejectedValue(dbError("demo@demo.invalid"));

    await expectStillSignedIn(await logout(token));
    expect(logger.info).not.toHaveBeenCalledWith("Removed demo workspace on logout");
    expectLogSafe(token);
  });

  it("finishes the demo logout on a retry after a failed removal", async () => {
    const token = tokenFor("demo@demo.invalid");
    removeDemoWorkspace.mockRejectedValueOnce(dbError("demo@demo.invalid"));

    await expectStillSignedIn(await logout(token));
    await expectLoggedOut(await logout(token));
    expect(removeDemoWorkspace).toHaveBeenCalledTimes(2);
  });

  it("counts a demo account that is already gone as logged out", async () => {
    User.findOne.mockResolvedValueOnce(null);

    await expectLoggedOut(await logout(tokenFor("demo@demo.invalid")));
    expect(removeDemoWorkspace).not.toHaveBeenCalled();
  });
});
