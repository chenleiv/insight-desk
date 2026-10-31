// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { User, Document, logger } = vi.hoisted(() => ({
  User: { find: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  Document: { find: vi.fn(), insertMany: vi.fn(), deleteMany: vi.fn() },
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("../models.js", () => ({ User, Document, Chunk: { insertMany: vi.fn() } }));
vi.mock("../rag/syncChunks.js", () => ({ deleteDocumentChunks: vi.fn() }));
vi.mock("../logger.js", () => ({ logger }));

import { runDemoCleanup, startDemoCleanup, createDemoWorkspace, DEMO_CLEANUP_INTERVAL_MS } from "../demo.js";

const lean = (value) => ({ lean: async () => value });
const EXPIRED = [{ _id: "demo-a" }, { _id: "demo-b" }];

beforeEach(() => {
  vi.clearAllMocks();
  User.find.mockReturnValue(lean(EXPIRED));
  Document.find.mockReturnValue(lean([]));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runDemoCleanup", () => {
  it("logs how many workspaces were removed and nothing that identifies them", async () => {
    expect(await runDemoCleanup()).toBe(2);

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("Removed expired demo workspaces", { count: 2 });
    expect(JSON.stringify(logger.info.mock.calls)).not.toMatch(/demo-a|demo-b/);
  });

  it("does not log when nothing expired", async () => {
    User.find.mockReturnValue(lean([]));

    expect(await runDemoCleanup()).toBe(0);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("skips a pass while the previous one is still running", async () => {
    let finish;
    User.find.mockReturnValueOnce({ lean: () => new Promise((resolve) => { finish = resolve; }) });

    const first = runDemoCleanup();
    expect(await runDemoCleanup()).toBe(0);
    expect(User.find).toHaveBeenCalledTimes(1);

    finish(EXPIRED);
    expect(await first).toBe(2);

    // Once the first pass is done, the next one runs again.
    await runDemoCleanup();
    expect(User.find).toHaveBeenCalledTimes(2);
  });

  it("never throws and runs again after a failure", async () => {
    User.find.mockImplementationOnce(() => {
      throw new Error("db hiccup");
    });

    expect(await runDemoCleanup()).toBe(0);
    expect(logger.error).toHaveBeenCalledWith("Demo cleanup failed", { message: "db hiccup" });
    expect(await runDemoCleanup()).toBe(2);
  });
});

describe("startDemoCleanup", () => {
  it("runs once on start and then on every interval, without new sign-ups", async () => {
    vi.useFakeTimers();
    User.find.mockReturnValue(lean([]));

    const timer = startDemoCleanup();
    await vi.advanceTimersByTimeAsync(0);
    expect(User.find).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(DEMO_CLEANUP_INTERVAL_MS);
    expect(User.find).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(DEMO_CLEANUP_INTERVAL_MS);
    expect(User.find).toHaveBeenCalledTimes(3);

    clearInterval(timer);
  });

  it("does not keep the process alive", () => {
    vi.useFakeTimers();
    const timer = startDemoCleanup();
    expect(timer.hasRef()).toBe(false);
    clearInterval(timer);
  });
});

describe("createDemoWorkspace", () => {
  it("no longer runs the cleanup itself", async () => {
    User.create.mockImplementation(async (u) => ({ _id: "demo-new", ...u }));
    Document.insertMany.mockImplementation(async (docs) => docs);

    await createDemoWorkspace();
    expect(User.find).not.toHaveBeenCalled();
  });
});
