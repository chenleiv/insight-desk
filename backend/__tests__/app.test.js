// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// Keeps the test from loading the real model when the routes are imported.
vi.mock("../rag/embed.js", () => ({ embed: vi.fn() }));

import { createApp } from "../app.js";

const INDEX_HTML = "<!doctype html><title>Insight Desk</title>";
const BUNDLE = `console.log("${"bundle ".repeat(2000)}");`;

// The real app, serving a small stand-in for the built frontend.
let distPath;
let server;
let base;

beforeAll(async () => {
  distPath = mkdtempSync(path.join(tmpdir(), "insight-desk-dist-"));
  mkdirSync(path.join(distPath, "assets"));
  writeFileSync(path.join(distPath, "index.html"), INDEX_HTML);
  writeFileSync(path.join(distPath, "assets", "main.js"), BUNDLE);
  await new Promise((resolve) => {
    server = createApp({ distPath }).listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(distPath, { recursive: true });
});

describe("security headers", () => {
  it.each([
    ["the main page", "/"],
    ["index.html", "/index.html"],
    ["an inner page", "/hub"],
    ["a built asset", "/assets/main.js"],
  ])("are set on %s", async (_label, url) => {
    const res = await fetch(`${base}${url}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("do not change the main page's content", async () => {
    const res = await fetch(`${base}/`);

    expect(await res.text()).toBe(INDEX_HTML);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
  });
});
