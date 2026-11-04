// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const { User } = vi.hoisted(() => ({ User: { findOne: vi.fn() } }));
vi.mock("../models.js", () => ({ User }));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../demo.js", () => ({ createDemoWorkspace: vi.fn(), removeDemoWorkspace: vi.fn() }));

import authRouter from "../auth.js";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const PASSWORD = "correct-password";
const alice = {
  _id: "user-1",
  email: "alice@example.com",
  role: "viewer",
  favorites: [],
  password_hash: bcrypt.hashSync(PASSWORD, 4),
};

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
  User.findOne.mockReset().mockResolvedValue(alice);
});

const meWith = (token) =>
  fetch(`${base}/api/auth/me`, { headers: { Cookie: `access_token=${token}` } });

const payload = { sub: alice.email, role: alice.role };

describe("JWT algorithm", () => {
  it("signs session tokens with HS256", async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: alice.email, password: PASSWORD }),
    });
    const token = res.headers.getSetCookie()[0].split(";")[0].split("=")[1];

    expect(jwt.decode(token, { complete: true }).header.alg).toBe("HS256");
    expect((await meWith(token)).status).toBe(200);
  });

  it("rejects a token signed with the right secret but another HMAC algorithm", async () => {
    const token = jwt.sign(payload, SECRET, { algorithm: "HS512" });

    expect((await meWith(token)).status).toBe(401);
  });

  it("rejects an unsigned token", async () => {
    const token = jwt.sign(payload, "", { algorithm: "none" });

    expect((await meWith(token)).status).toBe(401);
  });
});
