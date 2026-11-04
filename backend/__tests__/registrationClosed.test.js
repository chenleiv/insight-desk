// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";

const { User, createDemoWorkspace } = vi.hoisted(() => ({
  User: { findOne: vi.fn(async () => null), create: vi.fn() },
  createDemoWorkspace: vi.fn(),
}));
vi.mock("../models.js", () => ({ User }));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../demo.js", () => ({ createDemoWorkspace, removeDemoWorkspace: vi.fn() }));

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

beforeEach(() => vi.clearAllMocks());

const post = (path, body) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/auth/register", () => {
  it.each([
    ["a valid body", { email: "new@example.com", password: "a-long-enough-password" }],
    ["an invalid body", { email: "nope" }],
    ["an existing address", { email: "owner@example.com", password: "a-long-enough-password" }],
  ])("refuses %s with the same answer and creates nothing", async (_label, body) => {
    const res = await post("/api/auth/register", body);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ detail: "Registration is closed" });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(User.findOne).not.toHaveBeenCalled();
    expect(User.create).not.toHaveBeenCalled();
  });
});

describe("the demo", () => {
  it("still starts while registration is closed", async () => {
    createDemoWorkspace.mockResolvedValue({ email: "demo-1@demo.invalid", role: "demo", favorites: [] });

    const res = await post("/api/auth/demo");

    expect(res.status).toBe(201);
    expect(res.headers.getSetCookie()[0]).toMatch(/^access_token=/);
  });
});
