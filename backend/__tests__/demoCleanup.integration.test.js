// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";
import { startMongoServer } from "./mongoMemory.js";

vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import { User, Document, Chunk } from "../models.js";
import { removeExpiredDemoWorkspaces, removeDemoWorkspace } from "../demo.js";

// Runs against a real in-memory MongoDB, so the delete filters are exercised for real.
const NOW = new Date("2026-10-31T12:00:00Z");
const PAST = new Date(NOW.getTime() - 60 * 1000);
const FUTURE = new Date(NOW.getTime() + 60 * 60 * 1000);

let mongo;
let bucket;
let users;

beforeAll(async () => {
  mongo = await startMongoServer();
  await mongoose.connect(mongo.getUri());
  bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "attachments" });
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

function uploadFile(name) {
  return new Promise((resolve, reject) => {
    const stream = bucket.openUploadStream(name);
    stream.on("finish", () => resolve(stream.id)).on("error", reject);
    stream.end(Buffer.from(`file of ${name}`));
  });
}

// A user with one document, one attachment stored in GridFS, and one chunk.
async function seedWorkspace(user) {
  const created = await User.create(user);
  const gridfsId = await uploadFile(`${user.email}.txt`);
  const doc = await Document.create({
    title: user.email,
    category: "Test",
    content: "x",
    ownerId: created._id,
    demo: user.role === "demo",
    attachments: [{ url: "/f", fileName: "f.txt", fileType: "text/plain", gridfsId }],
  });
  await Chunk.create({ docId: doc._id, ownerId: created._id, index: 0, text: "x" });
  return created;
}

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  users = {
    expiredDemo: await seedWorkspace({ email: "demo-old@demo.invalid", role: "demo", expiresAt: PAST }),
    liveDemo: await seedWorkspace({ email: "demo-new@demo.invalid", role: "demo", expiresAt: FUTURE }),
    demoWithoutExpiry: await seedWorkspace({ email: "demo-none@demo.invalid", role: "demo" }),
    admin: await seedWorkspace({ email: "admin@corp.example", role: "admin" }),
    // A non-demo account with a past expiresAt must still never be removed.
    viewer: await seedWorkspace({ email: "viewer@corp.example", role: "viewer", expiresAt: PAST }),
  };
});

// Which of the seeded users still have their account, documents, chunks and files.
async function remaining() {
  const files = await bucket.find().toArray();
  const result = {};
  for (const [name, user] of Object.entries(users)) {
    const docs = await Document.find({ ownerId: user._id }).lean();
    const fileIds = docs.flatMap((d) => d.attachments.map((a) => String(a.gridfsId)));
    result[name] = {
      user: Boolean(await User.exists({ _id: user._id })),
      documents: docs.length,
      chunks: await Chunk.countDocuments({ ownerId: user._id }),
      files: files.filter((f) => fileIds.includes(String(f._id))).length,
    };
  }
  return result;
}

const KEPT = { user: true, documents: 1, chunks: 1, files: 1 };
const GONE = { user: false, documents: 0, chunks: 0, files: 0 };

describe("removeExpiredDemoWorkspaces", () => {
  it("removes only expired demo workspaces and never touches other accounts or live demos", async () => {
    expect(await removeExpiredDemoWorkspaces(NOW)).toBe(1);

    expect(await remaining()).toEqual({
      expiredDemo: GONE,
      liveDemo: KEPT,
      demoWithoutExpiry: KEPT,
      admin: KEPT,
      viewer: KEPT,
    });
    // Nothing is left behind that belonged to the removed user.
    expect(await bucket.find().toArray()).toHaveLength(4);
    expect(await Chunk.countDocuments()).toBe(4);
  });

  it("is safe when two runs overlap", async () => {
    const counts = await Promise.all([removeExpiredDemoWorkspaces(NOW), removeExpiredDemoWorkspaces(NOW)]);

    expect(counts.every((n) => n <= 1)).toBe(true);
    expect((await remaining()).expiredDemo).toEqual(GONE);
    expect((await remaining()).liveDemo).toEqual(KEPT);
  });
});

describe("removeDemoWorkspace", () => {
  it("removes one live demo workspace and nothing else", async () => {
    expect(await removeDemoWorkspace(users.liveDemo._id)).toBe(1);

    const left = await remaining();
    expect(left.liveDemo).toEqual(GONE);
    expect(left.expiredDemo).toEqual(KEPT);
    expect(left.admin).toEqual(KEPT);
  });

  it("does nothing for a non-demo account", async () => {
    expect(await removeDemoWorkspace(users.admin._id)).toBe(0);
    expect(await removeDemoWorkspace(users.viewer._id)).toBe(0);

    const left = await remaining();
    expect(left.admin).toEqual(KEPT);
    expect(left.viewer).toEqual(KEPT);
  });
});
