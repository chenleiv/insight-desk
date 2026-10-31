// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";

const OWN_ORIGIN = "https://insight.example.com";

const { User, Document, logger, createDemoWorkspace } = vi.hoisted(() => ({
  User: { findOne: vi.fn(), countDocuments: vi.fn() },
  Document: { find: vi.fn(), findById: vi.fn(), create: vi.fn(), countDocuments: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createDemoWorkspace: vi.fn(),
}));
vi.mock("../models.js", () => ({ User, Document }));
vi.mock("../logger.js", () => ({ logger }));
vi.mock("../rag/syncChunks.js", () => ({ syncDocumentChunks: vi.fn(), deleteDocumentChunks: vi.fn() }));
vi.mock("../demo.js", () => ({ createDemoWorkspace, removeDemoWorkspace: vi.fn() }));

let setup;
let server;
let base;

beforeAll(async () => {
  // Render sets only FRONTEND_URL, with no APP_BASE_URL; a trailing slash must not matter.
  vi.stubEnv("FRONTEND_URL", `${OWN_ORIGIN}/`);
  vi.stubEnv("APP_BASE_URL", "");
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
  setup = await import("../middleware/setup.js");
  const { default: authRouter } = await import("../auth.js");
  const { default: documentsRouter } = await import("../routes/documents.js");

  const app = express();
  setup.applyMiddleware(app);
  app.use(setup.jsonBody());
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  app.use("/api/documents", documentsRouter);
  app.get("/health", (req, res) => res.json({ ok: true }));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  vi.clearAllMocks();
  createDemoWorkspace.mockResolvedValue({ _id: "demo-1", email: "demo-1@demo.invalid", role: "demo" });
});

function send(method, path, origin, init = {}) {
  const headers = { "Content-Type": "application/json", ...init.headers };
  if (origin !== undefined) headers.Origin = origin;
  return fetch(`${base}${path}`, { method, redirect: "manual", ...init, headers });
}

const STATE_CHANGING = [
  ["POST", "/api/auth/logout"],
  ["POST", "/api/auth/demo"],
  ["POST", "/api/documents"],
  ["PUT", "/api/documents/doc-1"],
  ["PATCH", "/api/auth/profile"],
  ["DELETE", "/api/documents/doc-1"],
];

describe("cross-site request check", () => {
  it.each(STATE_CHANGING)("refuses a cross-site %s %s with 403", async (method, path) => {
    const res = await send(method, path, "https://evil.example");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ detail: "Cross-site request blocked" });
  });

  it("never reaches the route for a cross-site request", async () => {
    await send("POST", "/api/auth/demo", "https://evil.example");
    await send("POST", "/api/auth/logout", "https://evil.example", {
      headers: { Cookie: "access_token=victim-token" },
    });

    expect(createDemoWorkspace).not.toHaveBeenCalled();
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it("refuses Origin null", async () => {
    expect((await send("POST", "/api/auth/demo", "null")).status).toBe(403);
    expect(createDemoWorkspace).not.toHaveBeenCalled();
  });

  it("refuses an origin that differs from ours only in scheme, port or subdomain", async () => {
    for (const origin of ["http://insight.example.com", "https://insight.example.com:8443", "https://evil.insight.example.com"]) {
      expect((await send("POST", "/api/auth/logout", origin)).status).toBe(403);
    }
  });

  it("lets requests from our own origin through", async () => {
    expect((await send("POST", "/api/auth/logout", OWN_ORIGIN)).status).toBe(200);
    expect((await send("POST", "/api/auth/demo", OWN_ORIGIN)).status).toBe(201);
    // Reaches the route, which then asks for a login.
    expect((await send("POST", "/api/documents", OWN_ORIGIN, { body: "{}" })).status).toBe(401);
  });

  it("compares origins after normalizing case and the default port", async () => {
    expect((await send("POST", "/api/auth/logout", "https://INSIGHT.example.com:443")).status).toBe(200);
  });

  it("lets requests without an Origin through", async () => {
    expect((await send("POST", "/api/auth/logout", undefined)).status).toBe(200);
    expect((await send("POST", "/api/auth/demo", undefined)).status).toBe(201);
  });

  it("does not affect GET requests from another site", async () => {
    expect((await send("GET", "/health", "https://evil.example")).status).toBe(200);
    // Reaches the route, which then asks for a login.
    expect((await send("GET", "/api/documents", "https://evil.example")).status).toBe(401);
    expect((await send("GET", "/api/auth/google", "https://evil.example")).status).toBe(302);
  });

  it("logs only the origin host and the route, never cookies", async () => {
    await send("POST", "/api/auth/logout", "https://evil.example/path?q=1", {
      headers: { Cookie: "access_token=victim-token" },
    });

    expect(logger.warn).toHaveBeenCalledWith("Blocked cross-site request", {
      originHost: "evil.example",
      route: "POST /api/auth/logout",
    });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("victim-token");
  });
});

describe("auth cookies", () => {
  const sameSite = (setCookie) => /;\s*SameSite=(\w+)/i.exec(setCookie)?.[1];

  it("sets the access token cookie with SameSite=Lax", async () => {
    const res = await send("POST", "/api/auth/demo", OWN_ORIGIN);
    const setCookie = res.headers.get("set-cookie");

    expect(setCookie).toMatch(/^access_token=/);
    expect(sameSite(setCookie)).toBe("Lax");
  });

  it("sets the OAuth state cookie with SameSite=Lax, so it survives the redirect back from Google", async () => {
    const res = await send("GET", "/api/auth/google", undefined);
    const setCookie = res.headers.get("set-cookie");

    expect(setCookie).toMatch(/^oauth_state=/);
    expect(sameSite(setCookie)).toBe("Lax");
  });
});

describe("allowed origins", () => {
  it("normalizes scheme, host and port and ignores a trailing slash", () => {
    expect(setup.normalizeOrigin("https://Insight.Example.com:443/")).toBe("https://insight.example.com");
    expect(setup.normalizeOrigin("http://localhost:5173/")).toBe("http://localhost:5173");
    expect(setup.normalizeOrigin("null")).toBeNull();
    expect(setup.normalizeOrigin("not a url")).toBeNull();
  });

  it("works with FRONTEND_URL alone", () => {
    expect(setup.allowedOrigins()).toContain(OWN_ORIGIN);
  });
});

describe("startup check", () => {
  function applyWith(env) {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    setup.applyMiddleware(express());
  }

  afterAll(() => {
    vi.stubEnv("FRONTEND_URL", `${OWN_ORIGIN}/`);
  });

  it("logs an error in production when neither FRONTEND_URL nor APP_BASE_URL is set", () => {
    applyWith({ NODE_ENV: "production", FRONTEND_URL: "", APP_BASE_URL: "" });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("FRONTEND_URL and APP_BASE_URL are both unset"));
  });

  it("stays quiet in production when only FRONTEND_URL is set", () => {
    applyWith({ NODE_ENV: "production", FRONTEND_URL: OWN_ORIGIN, APP_BASE_URL: "" });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("stays quiet outside production", () => {
    applyWith({ NODE_ENV: "test", FRONTEND_URL: "", APP_BASE_URL: "" });
    expect(logger.error).not.toHaveBeenCalled();
  });
});
