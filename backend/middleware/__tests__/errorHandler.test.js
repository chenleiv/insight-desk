// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";

const { logger } = vi.hoisted(() => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../../logger.js", () => ({ logger }));

import { errorHandler } from "../errorHandler.js";

const SECRET_DETAIL = "connection to mongodb://internal-host:27017 refused";

let server;
let baseUrl;

beforeEach(async () => {
  vi.clearAllMocks();
  const app = express();
  app.use(express.json());
  app.get("/api/boom", () => {
    throw new Error(SECRET_DETAIL);
  });
  app.post("/api/echo", (req, res) => res.json(req.body));
  app.use(errorHandler);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => new Promise((resolve) => server.close(resolve)));

describe("errorHandler", () => {
  it("returns a generic 500 and logs the details on the server", async () => {
    const res = await fetch(`${baseUrl}/api/boom`);
    const body = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(body)).toEqual({ detail: "Internal server error" });
    expect(body).not.toContain("mongodb");
    expect(logger.error).toHaveBeenCalledWith(
      "Request failed",
      expect.objectContaining({ path: "/api/boom", status: 500, message: SECRET_DETAIL, stack: expect.any(String) }),
    );
  });

  it("keeps the 400 status for malformed JSON without echoing the parser error", async () => {
    const res = await fetch(`${baseUrl}/api/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: "Bad request" });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
