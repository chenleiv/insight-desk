// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

const { User } = vi.hoisted(() => ({
  User: { findOne: vi.fn(), find: vi.fn(() => ({ select: () => ({ sort: async () => [] }) })) },
}));
vi.mock("../models.js", () => ({ User }));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../demo.js", () => ({ createDemoWorkspace: vi.fn(), removeDemoWorkspace: vi.fn(), DEMO_SAMPLE_USERS: [] }));

import authRouter from "../auth.js";
import usersRouter from "../routes/users.js";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
let server;
let base;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

const userWith = (fields) => ({ _id: "user-1", email: "someone@example.com", favorites: [], ...fields });

// The token stays valid in every test: only the stored user differs.
const get = (path, role) =>
  fetch(`${base}${path}`, {
    headers: { Cookie: `access_token=${jwt.sign({ sub: "someone@example.com", role }, SECRET)}` },
  });

beforeEach(() => {
  User.findOne.mockReset();
});

describe("a user disabled while the token is still valid", () => {
  it("is refused on a regular route", async () => {
    User.findOne.mockResolvedValue(userWith({ role: "viewer", status: "inactive" }));

    const res = await get("/api/auth/me", "viewer");

    expect(res.status).toBe(401);
    expect((await res.json()).detail).toBe("This account is not active");
  });

  it("is refused on an admin route, even as an admin", async () => {
    User.findOne.mockResolvedValue(userWith({ role: "admin", status: "inactive" }));

    expect((await get("/api/users", "admin")).status).toBe(401);
  });

  it("works again on the next request once re-enabled", async () => {
    User.findOne.mockResolvedValueOnce(userWith({ role: "viewer", status: "inactive" }));
    expect((await get("/api/auth/me", "viewer")).status).toBe(401);

    User.findOne.mockResolvedValueOnce(userWith({ role: "viewer", status: "active" }));
    expect((await get("/api/auth/me", "viewer")).status).toBe(200);
  });
});

describe("accounts that are not disabled", () => {
  it.each([
    ["status active", { status: "active" }],
    ["no stored status", {}],
  ])("keep working with %s", async (_label, fields) => {
    User.findOne.mockResolvedValue(userWith({ role: "admin", ...fields }));

    expect((await get("/api/auth/me", "admin")).status).toBe(200);
    expect((await get("/api/users", "admin")).status).toBe(200);
  });
});
