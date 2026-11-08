// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

const { User } = vi.hoisted(() => ({ User: { findOne: vi.fn() } }));
vi.mock("../models.js", () => ({ User }));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../demo.js", () => ({ createDemoWorkspace: vi.fn(), removeDemoWorkspace: vi.fn() }));

import authRouter from "../auth.js";

const alice = { _id: "user-1", email: "alice@example.com", role: "viewer", favorites: [] };

let server;
let base;

beforeAll(async () => {
  const app = express();
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  User.findOne.mockReset().mockResolvedValue(alice);
});

const meWith = (token) =>
  fetch(`${base}/api/auth/me`, { headers: { Cookie: `access_token=${token}` } });

const validToken = () =>
  jwt.sign({ sub: alice.email, role: alice.role }, process.env.JWT_SECRET || "dev-secret-change-me");

describe("getCurrentUser", () => {
  it("returns 500, not 401, when the user lookup fails", async () => {
    User.findOne.mockRejectedValue(new Error("connection lost"));

    const res = await meWith(validToken());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ detail: "Internal server error" });
  });

  it("still returns 401 for an invalid token", async () => {
    const res = await meWith("not-a-jwt");

    expect(res.status).toBe(401);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it("still returns 401 when the user no longer exists", async () => {
    User.findOne.mockResolvedValue(null);

    expect((await meWith(validToken())).status).toBe(401);
  });

  it("returns the user for a valid session", async () => {
    const res = await meWith(validToken());

    expect(res.status).toBe(200);
    expect((await res.json()).email).toBe(alice.email);
  });
});
