// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { startMongoReplSet } from "../../__tests__/mongoMemory.js";

import { Chunk } from "../../models.js";
import { reindexDocument } from "../reindexDocument.js";
import { embeddingKey } from "../embeddingInput.js";

// Transactions need a replica set, so this runs against a real in-memory one, like Atlas.
let replSet;

beforeAll(async () => {
  replSet = await startMongoReplSet({ count: 1, storageEngine: "wiredTiger" });
  await mongoose.connect(replSet.getUri());
  await Chunk.init();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

afterEach(async () => {
  await Chunk.deleteMany({});
});

const ownerId = new mongoose.Types.ObjectId();
// Long enough to split into several chunks.
const content = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} about OAuth 2.0 flows.`).join(" ");
const newDoc = (title = "OAuth") => ({ _id: new mongoose.Types.ObjectId(), ownerId, title, content, attachments: [] });
const embedFake = () => vi.fn(async (text) => [text.length, 1]);
const stored = (docId) => Chunk.find({ docId }).sort({ index: 1 }).lean();

describe("reindexDocument against a replica set", () => {
  it("embeds every chunk of a document that has none, with its title", async () => {
    const doc = newDoc();
    const embed = embedFake();

    const r = await reindexDocument(doc, { embed });

    const chunks = await stored(doc._id);
    expect(r).toEqual({ chunks: chunks.length, embedded: chunks.length, reused: 0, changed: true, written: true });
    expect(chunks.length).toBeGreaterThan(1);
    expect(embed).toHaveBeenCalledTimes(chunks.length);
    expect(embed.mock.calls.every(([text]) => text.startsWith("OAuth\n\n"))).toBe(true);
    for (const c of chunks) {
      expect(c.text.startsWith("OAuth\n\n")).toBe(false);
      expect(c.embeddingKey).toBe(embeddingKey("OAuth", c.text));
    }
  });

  it("is idempotent: a second run embeds nothing and writes nothing", async () => {
    const doc = newDoc();
    await reindexDocument(doc, { embed: embedFake() });
    const before = await stored(doc._id);
    const embed = embedFake();

    const r = await reindexDocument(doc, { embed });

    expect(r).toEqual({ chunks: before.length, embedded: 0, reused: before.length, changed: false, written: false });
    expect(embed).not.toHaveBeenCalled();
    // Same documents, not deleted and reinserted.
    expect(await stored(doc._id)).toEqual(before);
  });

  it("re-embeds every chunk after a title change", async () => {
    const doc = newDoc("OAuth");
    await reindexDocument(doc, { embed: embedFake() });
    const embed = embedFake();

    const r = await reindexDocument({ ...doc, title: "OAuth 2.0 Authorization Flows" }, { embed });

    expect(r.embedded).toBe(r.chunks);
    expect(r.reused).toBe(0);
    const chunks = await stored(doc._id);
    expect(chunks.every((c) => c.embeddingKey === embeddingKey("OAuth 2.0 Authorization Flows", c.text))).toBe(true);
  });

  it("re-splits and re-embeds chunks stored by the old chunker without a key", async () => {
    const doc = newDoc();
    await Chunk.create({ docId: doc._id, ownerId, index: 0, text: "OAuth 2. 0 old split text.", embedding: [1, 1] });
    const embed = embedFake();

    const r = await reindexDocument(doc, { embed });

    const chunks = await stored(doc._id);
    expect(r.embedded).toBe(chunks.length);
    expect(chunks.some((c) => c.text.includes("OAuth 2. 0"))).toBe(false);
    expect(chunks.every((c) => c.embeddingKey)).toBe(true);
  });

  it("with dryRun, reports what would change but writes nothing", async () => {
    const doc = newDoc();
    await Chunk.create({ docId: doc._id, ownerId, index: 0, text: "OAuth 2. 0 old split text.", embedding: [1, 1] });
    const before = await stored(doc._id);
    const embed = embedFake();

    const r = await reindexDocument(doc, { embed, dryRun: true });

    expect(r.changed).toBe(true);
    expect(r.written).toBe(false);
    expect(r.embedded).toBe(r.chunks);
    expect(embed).not.toHaveBeenCalled();
    expect(await stored(doc._id)).toEqual(before);
  });
});
