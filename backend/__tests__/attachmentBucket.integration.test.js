// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startMongoServer } from "./mongoMemory.js";
import { getAttachmentBucket } from "../attachmentBucket.js";

// Runs the production bucket against a real in-memory MongoDB, so the driver is not mocked.
// Stored attachments live in attachments.files and attachments.chunks; these names are written out
// here on purpose, so a change to the production bucket name fails this test.
const FILES = "attachments.files";
const CHUNKS = "attachments.chunks";

let mongo;

beforeAll(async () => {
  mongo = await startMongoServer();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

function upload(bucket, name, data) {
  return new Promise((resolve, reject) => {
    const stream = bucket.openUploadStream(name, { metadata: { contentType: "text/plain" } });
    stream.on("finish", () => resolve(stream.id)).on("error", reject);
    stream.end(data);
  });
}

async function download(bucket, id) {
  const parts = [];
  for await (const part of bucket.openDownloadStream(id)) parts.push(part);
  return Buffer.concat(parts);
}

describe("getAttachmentBucket", () => {
  it("uses the GridFSBucket class from the driver copy mongoose uses", () => {
    expect(getAttachmentBucket()).toBeInstanceOf(mongoose.mongo.GridFSBucket);
  });

  it("stores files in the production attachments bucket", async () => {
    const id = await upload(getAttachmentBucket(), "policy.txt", Buffer.from("stored text"));

    const db = mongoose.connection.db;
    expect(await db.collection(FILES).findOne({ _id: id })).toMatchObject({ filename: "policy.txt" });
    expect(await db.collection(CHUNKS).countDocuments({ files_id: id })).toBeGreaterThan(0);
  });

  it("downloads exactly the bytes that were uploaded", async () => {
    // Larger than one GridFS chunk (255 KiB), so the download joins several chunks.
    const data = Buffer.alloc(300 * 1024, "abc");
    const id = await upload(getAttachmentBucket(), "large.txt", data);

    const result = await download(getAttachmentBucket(), id);
    expect(result.equals(data)).toBe(true);
  });

  it("deletes the file and its chunks", async () => {
    const bucket = getAttachmentBucket();
    const id = await upload(bucket, "gone.txt", Buffer.from("to delete"));

    await bucket.delete(id);

    const db = mongoose.connection.db;
    expect(await db.collection(FILES).countDocuments({ _id: id })).toBe(0);
    expect(await db.collection(CHUNKS).countDocuments({ files_id: id })).toBe(0);
  });
});
