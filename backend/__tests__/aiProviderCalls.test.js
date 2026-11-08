// @vitest-environment node
// The real Groq SDK against a local stand-in for the provider, so the attempts and
// waits measured here are what production would do.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import express from "express";
import http from "http";

const { logger } = vi.hoisted(() => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../logger.js", () => ({ logger }));
vi.mock("../rag/embed.js", () => ({ embed: vi.fn() }));
vi.mock("../rag/retrievalLog.js", () => ({ logRetrieval: vi.fn(async () => null), saveFeedback: vi.fn() }));
vi.mock("../rag/search.js", () => ({
  search: vi.fn(async () => [{ docId: "doc-1", title: "Policy", index: 0, text: "Ask the team lead.", score: 0.9 }]),
}));
vi.mock("../auth.js", () => {
  const authenticate = (req, _res, next) => {
    req.user = { _id: "user-1", role: "admin" };
    next();
  };
  return { getCurrentUser: authenticate, requireAdmin: authenticate };
});

const GENERIC_DETAIL = "Error communicating with AI service. Please try again later.";

let provider;
let server;
let base;
let answerRequest;
let attempts;

beforeAll(async () => {
  provider = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      attempts++;
      answerRequest(res);
    });
  });
  await new Promise((resolve) => {
    provider.listen(0, "127.0.0.1", resolve);
  });
  vi.stubEnv("GROQ_API_KEY", "test-key");
  vi.stubEnv("GROQ_BASE_URL", `http://127.0.0.1:${provider.address().port}`);

  const { default: aiRouter } = await import("../ai.js");
  const app = express();
  app.use(express.json());
  app.use(aiRouter);
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  provider.closeAllConnections();
  await new Promise((resolve) => provider.close(resolve));
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  attempts = 0;
  vi.clearAllMocks();
});

const chat = (message = "vacation") => fetch(`${base}/api/ai/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message }),
});

describe("missing provider key", () => {
  afterEach(() => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
  });

  it("names the key only in the log", async () => {
    vi.stubEnv("GROQ_API_KEY", "");

    const res = await chat();
    const body = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(body)).toEqual({ detail: GENERIC_DETAIL });
    expect(body).not.toMatch(/GROQ|API_KEY|environment/i);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("GROQ_API_KEY"));
    expect(attempts).toBe(0);
  });
});

describe("provider call limits", () => {
  const ANSWER_TIMEOUT_MS = 30_000;
  const KEYWORDS_TIMEOUT_MS = 10_000;

  function replyWith(status, body, headers = {}) {
    return (res) => {
      res.writeHead(status, { "Content-Type": "application/json", ...headers });
      res.end(JSON.stringify(body));
    };
  }
  const answer = replyWith(200, { choices: [{ message: { content: "Ask the team lead [c1]." } }] });

  // Resolves when the provider has received `count` requests, which it never answers.
  function stall(count) {
    return new Promise((resolve) => {
      let received = 0;
      answerRequest = () => {
        if (++received === count) resolve();
      };
    });
  }

  afterEach(() => {
    vi.useRealTimers();
    provider.closeAllConnections();
  });

  it("does not retry a 429 or wait for its Retry-After", async () => {
    answerRequest = replyWith(429, { error: { message: "quota" } }, { "Retry-After": "300" });

    const res = await chat();

    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("300");
    expect(attempts).toBe(1);
  });

  it.each([500, 503])("does not retry a %i", async (status) => {
    answerRequest = replyWith(status, { error: { message: "down" } });

    const res = await chat();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ detail: GENERIC_DETAIL });
    expect(attempts).toBe(1);
  });

  it("stops waiting for an answer at its timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const stalled = stall(1);
    let settled = false;
    const pending = chat().finally(() => {
      settled = true;
    });
    await stalled;

    await vi.advanceTimersByTimeAsync(ANSWER_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const res = await pending;

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ detail: GENERIC_DETAIL });
    expect(attempts).toBe(1);
  });

  it("gives up on keyword translation at its shorter timeout, then still answers", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let requests = 0;
    const firstReceived = new Promise((resolve) => {
      answerRequest = (res) => {
        if (++requests === 1) resolve();
        else answer(res);
      };
    });
    const pending = chat("\u05d7\u05d5\u05e4\u05e9\u05d4");
    await firstReceived;

    await vi.advanceTimersByTimeAsync(KEYWORDS_TIMEOUT_MS);
    const res = await pending;

    expect(res.status).toBe(200);
    expect((await res.json()).answer).toBe("Ask the team lead [c1].");
    expect(attempts).toBe(2);
  });
});
