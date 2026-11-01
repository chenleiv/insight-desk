import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, ApiError, setUnauthorizedHandler } from "../base";
import { downloadDocument } from "../documentsClient";

const onUnauthorized = vi.fn();

function respondWith(status: number) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "nope" }), { status })));
}

beforeEach(() => {
  onUnauthorized.mockReset();
  setUnauthorizedHandler(onUnauthorized);
});

afterEach(() => {
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
});

describe("apiFetch session expiry", () => {
  it("reports a 401 on a regular request and still throws it", async () => {
    respondWith(401);

    await expect(apiFetch("/api/documents")).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("reports a 401 on a request with a query string", async () => {
    respondWith(401);

    await expect(apiFetch("/api/ai/quality?days=7")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it.each([
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/demo",
    "/api/auth/me",
    "/api/auth/logout",
    "/api/auth/password",
  ])("does not report a 401 from %s", async (path) => {
    respondWith(401);

    await expect(apiFetch(path, { method: "POST" })).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it.each([403, 500])("does not report a %i", async (status) => {
    respondWith(status);

    await expect(apiFetch("/api/documents")).rejects.toMatchObject({ status });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("reports a 401 from a document download", async () => {
    respondWith(401);

    await expect(downloadDocument("doc-1", "md")).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });
});
