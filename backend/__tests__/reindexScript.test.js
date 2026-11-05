// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mongoose, Document, Chunk } = vi.hoisted(() => ({
  mongoose: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    connection: { host: "cluster0-shard-00-00.example.net", name: "insightdesk" },
  },
  Document: {
    find: vi.fn(() => ({ lean: () => ({ cursor: async function* () {} }) })),
    countDocuments: vi.fn(async () => 0),
    distinct: vi.fn(async () => []),
  },
  Chunk: {
    syncIndexes: vi.fn(),
    countDocuments: vi.fn(async () => 0),
    deleteMany: vi.fn(async () => ({ deletedCount: 0 })),
  },
}));
// No env file is loaded and no database or model is touched.
vi.mock("../loadEnv.js", () => ({}));
vi.mock("mongoose", () => ({ default: mongoose }));
vi.mock("../models.js", () => ({ Document, Chunk }));
vi.mock("../rag/reindexDocument.js", () => ({ reindexDocument: vi.fn() }));
vi.mock("../rag/embed.js", () => ({ embed: vi.fn() }));

const URI = "mongodb+srv://fake-user:fake-password@fake-host.example.invalid/insightdesk?retryWrites=true";
const argv = process.argv;
let log;

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubEnv("MONGODB_URI", URI);
  log = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  process.argv = argv;
  vi.unstubAllEnvs();
  log.mockRestore();
});

/** Run the script with the given arguments and wait until it disconnects. */
async function runReindex(...args) {
  process.argv = [argv[0], "reindex.js", ...args];
  await import("../scripts/reindex.js");
  await vi.waitFor(() => expect(mongoose.disconnect).toHaveBeenCalled());
  return log.mock.calls.map(([line]) => String(line));
}

describe("npm run reindex", () => {
  it("prints the host and database it connected to before any read or write", async () => {
    const lines = await runReindex();

    expect(mongoose.connect).toHaveBeenCalledWith(URI);
    expect(lines[0]).toBe("Connected to cluster0-shard-00-00.example.net, database insightdesk");
    const printedAt = log.mock.invocationCallOrder[0];
    expect(printedAt).toBeLessThan(Chunk.syncIndexes.mock.invocationCallOrder[0]);
    expect(printedAt).toBeLessThan(Document.find.mock.invocationCallOrder[0]);
  });

  it("marks the line in a dry run", async () => {
    const lines = await runReindex("--dry-run");

    expect(lines[0]).toBe("[dry run] Connected to cluster0-shard-00-00.example.net, database insightdesk");
    expect(Chunk.syncIndexes).not.toHaveBeenCalled();
  });

  it("never prints the connection string or its credentials", async () => {
    const lines = await runReindex();

    for (const line of lines) {
      expect(line).not.toContain("fake-user");
      expect(line).not.toContain("fake-password");
      expect(line).not.toContain("mongodb+srv://");
    }
  });
});
