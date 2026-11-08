// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import http from "http";
import path from "path";
import { gunzipSync } from "zlib";

// Keeps the test from loading the real model when the routes are imported.
vi.mock("../rag/embed.js", () => ({ embed: vi.fn() }));

import { createApp } from "../app.js";

const INDEX_HTML = "<!doctype html><title>Insight Desk</title>";
const BUNDLE = `console.log("${"bundle ".repeat(2000)}");`;
const FAVICON = readFileSync("public/favicon.svg", "utf8");

// The real app, serving a small stand-in for the built frontend.
let distPath;
let server;
let base;

beforeAll(async () => {
  distPath = mkdtempSync(path.join(tmpdir(), "insight-desk-dist-"));
  mkdirSync(path.join(distPath, "assets"));
  writeFileSync(path.join(distPath, "index.html"), INDEX_HTML);
  writeFileSync(path.join(distPath, "assets", "main.js"), BUNDLE);
  writeFileSync(path.join(distPath, "favicon.svg"), FAVICON);
  await new Promise((resolve) => {
    server = createApp({ distPath }).listen(0, "127.0.0.1", resolve);
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

  it("limit network, image, style and font sources on the main page", async () => {
    const header = (await fetch(`${base}/`)).headers.get("content-security-policy");
    const directives = Object.fromEntries(
      header.split(";").map((d) => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values]),
    );

    expect(directives["connect-src"]).toEqual(["'self'"]);
    expect(directives["img-src"]).toEqual(["'self'", "data:"]);
    // Self-hosted fonts: no stylesheet or font file comes from another host.
    expect(directives["style-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directives["font-src"]).toEqual(["'self'"]);
  });

  it("do not change the main page's content", async () => {
    const res = await fetch(`${base}/`);

    expect(await res.text()).toBe(INDEX_HTML);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
  });
});

describe("SPA fallback", () => {
  it.each([
    ["an old build's script", "/assets/HubPage-old.js"],
    ["an old build's stylesheet", "/assets/HubPage-old.css"],
    ["a name under assets without an extension", "/assets/old"],
    ["a missing file at the root", "/missing.js"],
    ["a missing icon", "/missing.ico"],
    ["a hidden file", "/.hidden"],
  ])("returns 404, not the main page, for %s", async (_label, url) => {
    const res = await fetch(`${base}${url}`);

    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain(INDEX_HTML);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it.each(["/hub", "/login", "/users", "/some/unknown/page", "/hub/"])("still serves the main page for %s", async (url) => {
    const res = await fetch(`${base}${url}`);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(INDEX_HTML);
  });

  it("still serves a file that exists", async () => {
    const res = await fetch(`${base}/assets/main.js`);

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("immutable");
  });
});

describe("favicon", () => {
  it("is served as an SVG with the security headers, revalidated on each load", async () => {
    const res = await fetch(`${base}/favicon.svg`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^image\/svg\+xml/);
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(res.headers.get("etag")).toBeTruthy();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("img-src 'self' data:");
  });

  it("is what /favicon.ico leads to, instead of a 404", async () => {
    const redirect = await fetch(`${base}/favicon.ico`, { redirect: "manual" });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("/favicon.svg");

    const followed = await fetch(`${base}/favicon.ico`);
    expect(followed.status).toBe(200);
    expect(await followed.text()).toBe(FAVICON);
  });

  it("is named by the main page and runs nothing", () => {
    expect(readFileSync("index.html", "utf8")).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg">');
    expect(FAVICON).not.toMatch(/<script|<style|href=|\son\w+=/i);
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
