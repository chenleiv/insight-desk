// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { startMongoServer } from "./mongoMemory.js";

const { logger } = vi.hoisted(() => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../logger.js", () => ({ logger }));
vi.mock("../rag/embed.js", () => ({ embed: vi.fn() }));

// The real app and a real in-memory MongoDB, so the request logger runs on every request.
const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const PASSWORD = "correct-password";
const EMAIL = "alice.secret@example.com";
const ADMIN_EMAIL = "admin.secret@example.com";

let mongo;
let distPath;
let server;
let base;
let User;
let admin;
let target;
let adminCookie;

beforeAll(async () => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
  mongo = await startMongoServer();
  await mongoose.connect(mongo.getUri());
  ({ User } = await import("../models.js"));
  const { createApp } = await import("../app.js");
  distPath = mkdtempSync(path.join(tmpdir(), "insight-desk-dist-"));
  writeFileSync(path.join(distPath, "index.html"), "<!doctype html>");
  await new Promise((resolve) => {
    server = createApp({ distPath }).listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise((resolve) => server.close(resolve));
  rmSync(distPath, { recursive: true });
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await User.deleteMany({});
  admin = await User.create({ email: ADMIN_EMAIL, role: "admin" });
  target = await User.create({ email: EMAIL, role: "viewer", password_hash: bcrypt.hashSync(PASSWORD, 4) });
  adminCookie = `access_token=${jwt.sign({ sub: ADMIN_EMAIL, role: "admin" }, SECRET)}`;
});

afterEach(() => vi.unstubAllGlobals());

const allLogs = () =>
  JSON.stringify([...logger.info.mock.calls, ...logger.warn.mock.calls, ...logger.error.mock.calls]);

const post = (url, body) =>
  fetch(`${base}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const adminSend = (method, url, body) =>
  fetch(`${base}${url}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    ...(body && { body: JSON.stringify(body) }),
  });

function expectNoPersonalData(...secrets) {
  const logs = allLogs();
  for (const value of [EMAIL, ADMIN_EMAIL, "alice.secret", "admin.secret", PASSWORD, ...secrets]) {
    expect(logs).not.toContain(value);
  }
}

describe("request log", () => {
  it("logs the route without its query string, so the Google code stays out", async () => {
    await fetch(`${base}/api/auth/google/callback?code=SECRET-GOOGLE-CODE&state=SECRET-STATE`, { redirect: "manual" });

    expect(logger.info).toHaveBeenCalledWith("GET /api/auth/google/callback");
    expectNoPersonalData("SECRET-GOOGLE-CODE", "SECRET-STATE");
  });
});

describe("failed logins", () => {
  it.each([
    ["an unknown email", "nobody.secret@example.com", "wrong-password-value", "invalid_credentials"],
    ["a wrong password", EMAIL, "wrong-password-value", "invalid_credentials"],
    ["input that fails validation", "nobody.secret", "wrong-password-value", "invalid_input"],
  ])("logs %s with its reason and no personal data", async (_label, email, password, reason) => {
    await post("/api/auth/login", { email, password });

    expect(logger.warn).toHaveBeenCalledWith("Login failed", { method: "password", reason });
    expectNoPersonalData("nobody.secret", "wrong-password-value");
  });

  it("logs a disabled account without saying whose", async () => {
    await User.updateOne({ _id: target._id }, { status: "inactive" });

    await post("/api/auth/login", { email: EMAIL, password: PASSWORD });

    expect(logger.warn).toHaveBeenCalledWith("Login failed", { method: "password", reason: "account_inactive" });
    expectNoPersonalData();
  });

  it("logs nothing as failed on a successful login", async () => {
    expect((await post("/api/auth/login", { email: EMAIL, password: PASSWORD })).status).toBe(200);

    expect(logger.warn).not.toHaveBeenCalled();
    expectNoPersonalData();
  });

  it("logs a refused Google login with its reason", async () => {
    await fetch(`${base}/api/auth/google/callback?code=SECRET-GOOGLE-CODE&state=forged`, { redirect: "manual" });

    expect(logger.warn).toHaveBeenCalledWith("Login failed", { method: "google", reason: "google_state_mismatch" });
  });
});

describe("failed registrations", () => {
  it("logs the refusal and nothing that was submitted", async () => {
    await post("/api/auth/register", { email: EMAIL, password: PASSWORD, displayName: "Secret Name" });

    expect(logger.warn).toHaveBeenCalledWith("Registration refused", { reason: "closed" });
    expectNoPersonalData("Secret Name");
  });
});

describe("a failed Google token exchange", () => {
  it("logs Google's error code and not the rest of the response", async () => {
    const realFetch = globalThis.fetch;
    const start = await realFetch(`${base}/api/auth/google`, { redirect: "manual" });
    const cookie = start.headers.get("set-cookie").split(";")[0];
    const state = new URL(start.headers.get("location")).searchParams.get("state");
    vi.stubGlobal("fetch", async (url, init) =>
      (String(url).startsWith("https://oauth2.googleapis.com/token")
        ? Response.json({ error: "invalid_grant", error_description: "SECRET-DETAIL", id_token: "SECRET-TOKEN" })
        : realFetch(url, init)));

    await realFetch(`${base}/api/auth/google/callback?code=abc&state=${state}`, {
      redirect: "manual",
      headers: { cookie },
    });

    expect(logger.error).toHaveBeenCalledWith("Google token exchange failed", { error: "invalid_grant" });
    expectNoPersonalData("SECRET-DETAIL", "SECRET-TOKEN");
  });
});

describe("admin actions", () => {
  it("logs a user update with ids and the changed values", async () => {
    await adminSend("PATCH", `/api/users/${target._id}`, { role: "admin", status: "inactive" });

    const [, details] = logger.info.mock.calls.find(([message]) => message === "Admin action");
    expect(JSON.parse(JSON.stringify(details))).toEqual({
      action: "user.update",
      actorId: admin._id.toString(),
      targetId: target._id.toString(),
      role: "admin",
      status: "inactive",
    });
    expectNoPersonalData();
  });

  it("logs a user deletion with ids", async () => {
    await adminSend("DELETE", `/api/users/${target._id}`);

    const [, details] = logger.info.mock.calls.find(([message]) => message === "Admin action");
    expect(JSON.parse(JSON.stringify(details))).toEqual({
      action: "user.delete",
      actorId: admin._id.toString(),
      targetId: target._id.toString(),
    });
    expectNoPersonalData();
  });

  it("logs a prompt save without the prompt", async () => {
    await adminSend("PATCH", "/api/ai/prompt", { prompt: "SECRET-PROMPT" });

    const [, details] = logger.info.mock.calls.find(([message]) => message === "Admin action");
    expect(details.action).toBe("ai.prompt.update");
    expectNoPersonalData("SECRET-PROMPT");
  });

  it("logs a prompt reset without the prompt", async () => {
    await adminSend("PATCH", "/api/ai/prompt", { prompt: "SECRET-PROMPT" });
    logger.info.mockClear();
    await adminSend("DELETE", "/api/ai/prompt");

    const [, details] = logger.info.mock.calls.find(([message]) => message === "Admin action");
    expect(details.action).toBe("ai.prompt.reset");
    expectNoPersonalData("SECRET-PROMPT", "You are an AI assistant");
  });

  it("logs a suggestions save without the questions", async () => {
    await adminSend("PATCH", "/api/ai/suggestions", { questions: ["SECRET-QUESTION"] });

    const [, details] = logger.info.mock.calls.find(([message]) => message === "Admin action");
    expect(details.action).toBe("ai.suggestions.update");
    expectNoPersonalData("SECRET-QUESTION");
  });

  it("logs nothing when the update is refused", async () => {
    await adminSend("PATCH", `/api/users/${admin._id}`, { status: "inactive" });

    expect(logger.info.mock.calls.some(([message]) => message === "Admin action")).toBe(false);
  });
});
