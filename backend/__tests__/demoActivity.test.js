// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

const { User } = vi.hoisted(() => ({ User: { findOne: vi.fn(), updateOne: vi.fn() } }));

vi.mock("../models.js", () => ({ User, Document: {}, Chunk: {} }));
vi.mock("../rag/syncChunks.js", () => ({ deleteDocumentChunks: vi.fn() }));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import authRouter from "../auth.js";

const TOKEN = jwt.sign({ sub: "person@demo.invalid" }, "dev-secret-change-me");
const FUTURE = new Date(Date.now() + 60 * 60 * 1000);

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
  vi.clearAllMocks();
  User.updateOne.mockResolvedValue({ modifiedCount: 1 });
});

const me = () => fetch(`${base}/api/auth/me`, { headers: { Cookie: `access_token=${TOKEN}` } });
const signedIn = (fields) => User.findOne.mockResolvedValue({ _id: "user-1", email: "person@demo.invalid", favorites: [], ...fields });

describe("demo activity", () => {
  it("records activity for a demo user not seen recently", async () => {
    signedIn({ role: "demo", expiresAt: FUTURE, lastActiveAt: new Date(Date.now() - 60 * 60 * 1000) });
    expect((await me()).status).toBe(200);
    expect(User.updateOne).toHaveBeenCalledWith({ _id: "user-1" }, { $set: { lastActiveAt: expect.any(Date) } });
  });

  it("records activity for a workspace from before it was tracked", async () => {
    signedIn({ role: "demo", expiresAt: FUTURE });
    await me();
    expect(User.updateOne).toHaveBeenCalledTimes(1);
  });

  it("does not write on every request", async () => {
    signedIn({ role: "demo", expiresAt: FUTURE, lastActiveAt: new Date() });
    await me();
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it("does not record activity for a regular user", async () => {
    signedIn({ role: "viewer" });
    await me();
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it("does not fail the request when recording fails", async () => {
    signedIn({ role: "demo", expiresAt: FUTURE });
    User.updateOne.mockRejectedValue(new Error("write failed"));
    expect((await me()).status).toBe(200);
  });
});
