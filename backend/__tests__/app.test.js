// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import http from "http";
import path from "path";
import { gunzipSync } from "zlib";

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

  it("limit network and image sources on the main page, and keep the font provider working", async () => {
    const header = (await fetch(`${base}/`)).headers.get("content-security-policy");
    const directives = Object.fromEntries(
      header.split(";").map((d) => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values]),
    );

    expect(directives["connect-src"]).toEqual(["'self'"]);
    expect(directives["img-src"]).toEqual(["'self'", "data:"]);
    // Google Fonts: the stylesheet and the font files come from https hosts.
    expect(directives["style-src"]).toContain("https:");
    expect(directives["font-src"]).toContain("https:");
  });

  it("do not change the main page's content", async () => {
    const res = await fetch(`${base}/`);

    expect(await res.text()).toBe(INDEX_HTML);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
  });
});

describe("static file compression", () => {
  // Raw bytes on the wire: fetch would decompress them before a test could measure them.
  function rawGet(url, acceptEncoding, headers = {}) {
    return new Promise((resolve, reject) => {
      http.get(`${base}${url}`, { headers: { "Accept-Encoding": acceptEncoding, ...headers } }, (res) => {
        const parts = [];
        res.on("data", (part) => parts.push(part));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) }));
      }).on("error", reject);
    });
  }

  it("compresses a built asset and keeps its long-term cache header", async () => {
    const { headers, body } = await rawGet("/assets/main.js", "gzip");

    expect(headers["content-encoding"]).toBe("gzip");
    expect(headers.vary).toMatch(/Accept-Encoding/i);
    expect(headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(body.length).toBeLessThan(BUNDLE.length / 2);
    expect(gunzipSync(body).toString()).toBe(BUNDLE);
  });

  it("sends the file as it is to a client that accepts no compression", async () => {
    const { headers, body } = await rawGet("/assets/main.js", "identity");

    expect(headers["content-encoding"]).toBeUndefined();
    expect(body.toString()).toBe(BUNDLE);
  });

  it("keeps revalidating the main page", async () => {
    const { headers } = await rawGet("/", "gzip");

    expect(headers["cache-control"]).toBe("public, max-age=0, must-revalidate");
  });

  // Raw as well: fetch adds "Cache-Control: no-cache" to a conditional request, which forces a 200.
  it("still answers a revalidation with 304", async () => {
    const { headers } = await rawGet("/assets/main.js", "gzip");

    const again = await rawGet("/assets/main.js", "gzip", { "If-None-Match": headers.etag });

    expect(headers.etag).toBeTruthy();
    expect(again.status).toBe(304);
  });
});
