// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Fake DNS: no test touches the real network.
const { lookup } = vi.hoisted(() => {
  const hosts = {
    localhost: "127.0.0.1",
    "internal.example": "10.0.0.7",
    "docs.example.com": "93.184.215.14",
  };
  const lookup = vi.fn(async (hostname) => {
    const address = hosts[hostname];
    if (!address) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return [{ address, family: 4 }];
  });
  return { lookup };
});
vi.mock("node:dns/promises", () => ({ lookup, default: { lookup } }));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { extractTextFromUrl, MAX_URL_BYTES } = await import("../textExtract.js");

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response("hello world", { headers: { "content-type": "text/plain" } }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const redirectTo = (location) => new Response(null, { status: 302, headers: { location } });

describe("extractTextFromUrl", () => {
  it("returns the text of a public document", async () => {
    await expect(extractTextFromUrl("https://docs.example.com/a.txt")).resolves.toBe("hello world");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });

  it.each(["file:///etc/passwd", "ftp://docs.example.com/a.txt", "data:text/plain,hi", "not a url"])(
    "rejects %s, which is not http or https",
    async (url) => {
      await expect(extractTextFromUrl(url)).rejects.toMatchObject({ code: "URL_NOT_ALLOWED" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(["http://localhost/", "http://127.0.0.1/", "http://127.1.2.3:8080/", "http://[::1]/", "http://0.0.0.0/"])(
    "rejects the local address %s",
    async (url) => {
      await expect(extractTextFromUrl(url)).rejects.toMatchObject({ code: "URL_NOT_ALLOWED" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    "http://10.0.0.5/",
    "http://172.16.0.1/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1/",
    "http://[fd00::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:10.0.0.5]/",
    "http://internal.example/",
  ])("rejects the internal address %s", async (url) => {
    await expect(extractTextFromUrl(url)).rejects.toMatchObject({ code: "URL_NOT_ALLOWED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a redirect to an internal address without following it", async () => {
    fetchMock.mockResolvedValueOnce(redirectTo("http://169.254.169.254/latest/meta-data/"));
    await expect(extractTextFromUrl("https://docs.example.com/a.txt")).rejects.toMatchObject({
      code: "URL_NOT_ALLOWED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows a redirect to another public address", async () => {
    fetchMock.mockResolvedValueOnce(redirectTo("/b.txt"));
    await expect(extractTextFromUrl("https://docs.example.com/a.txt")).resolves.toBe("hello world");
    expect(fetchMock.mock.calls[1][0]).toBe("https://docs.example.com/b.txt");
  });

  it("stops after too many redirects", async () => {
    fetchMock.mockImplementation(async () => redirectTo("https://docs.example.com/loop"));
    await expect(extractTextFromUrl("https://docs.example.com/a.txt")).rejects.toMatchObject({
      code: "TOO_MANY_REDIRECTS",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("rejects a file whose declared size is over the limit", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("x", { headers: { "content-type": "text/plain", "content-length": String(MAX_URL_BYTES + 1) } }),
    );
    await expect(extractTextFromUrl("https://docs.example.com/big.txt")).rejects.toMatchObject({
      code: "RESPONSE_TOO_LARGE",
    });
  });

  it("rejects a file that grows over the limit without declaring its size", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const body = new ReadableStream({
      pull(controller) {
        if (sent++ > 10) controller.close();
        else controller.enqueue(chunk);
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(body, { headers: { "content-type": "text/plain" } }));
    await expect(extractTextFromUrl("https://docs.example.com/big.txt")).rejects.toMatchObject({
      code: "RESPONSE_TOO_LARGE",
    });
  });
});
