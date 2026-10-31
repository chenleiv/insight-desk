import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';
import { User, Document, Chunk } from './models.js';
import { deleteDocumentChunks } from './rag/syncChunks.js';
import { buildDocumentChunks } from './rag/buildChunks.js';
import { chunkKey } from './rag/chunkKey.js';
import { logger } from './logger.js';

export const DEMO_TTL_MS = 24 * 60 * 60 * 1000;

const SAMPLE_DOCUMENTS = JSON.parse(
    readFileSync(new URL('./demo/sample-documents.json', import.meta.url), 'utf8'),
);

// Precomputed by `npm run embed:demo`, keyed by chunkKey(text), so demo
// workspaces get vectors without loading the model in the server.
const SAMPLE_VECTORS = JSON.parse(
    readFileSync(new URL('./demo/sample-embeddings.json', import.meta.url), 'utf8'),
).vectors;

const missingVectors = SAMPLE_DOCUMENTS
    .flatMap((doc) => buildDocumentChunks(doc))
    .filter((chunk) => !SAMPLE_VECTORS[chunkKey(chunk.text)]).length;
if (missingVectors) {
    logger.warn('Demo chunks without a precomputed vector; run npm run embed:demo', { count: missingVectors });
}

export const DEMO_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Remove the demo workspaces of the demo users matching `userFilter`: their
 * GridFS files, chunks, documents and the users themselves. `role: 'demo'` is
 * always added last, so no filter can reach another account. Every step is
 * safe to repeat, so two overlapping runs do no harm. Returns how many users
 * were removed.
 */
async function removeDemoWorkspaces(userFilter) {
    const users = await User.find({ ...userFilter, role: 'demo' }, '_id').lean();
    if (!users.length) return 0;

    const userIds = users.map((u) => u._id);
    const docs = await Document.find({ ownerId: { $in: userIds } }, '_id attachments.gridfsId').lean();
    const docIds = docs.map((d) => d._id);

    const fileIds = docs.flatMap((d) => (d.attachments ?? []).map((a) => a.gridfsId).filter(Boolean));
    if (fileIds.length) {
        const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'attachments' });
        await Promise.all(fileIds.map((id) => bucket.delete(id).catch(() => {})));
    }

    await deleteDocumentChunks(docIds);
    await Document.deleteMany({ _id: { $in: docIds } });
    await User.deleteMany({ _id: { $in: userIds } });
    return userIds.length;
}

/** Remove demo workspaces whose time is up. Returns how many were removed. */
export function removeExpiredDemoWorkspaces(now = new Date()) {
    return removeDemoWorkspaces({ expiresAt: { $lt: now } });
}

/** Remove one demo user's workspace; does nothing for any other account. */
export function removeDemoWorkspace(userId) {
    return removeDemoWorkspaces({ _id: userId });
}

let cleanupRunning = false;

/**
 * One cleanup pass. Skipped while the previous pass is still running, and
 * never throws. Logs only the count, never who was removed.
 */
export async function runDemoCleanup(now = new Date()) {
    if (cleanupRunning) return 0;
    cleanupRunning = true;
    try {
        const removed = await removeExpiredDemoWorkspaces(now);
        if (removed) logger.info('Removed expired demo workspaces', { count: removed });
        return removed;
    } catch (err) {
        logger.error('Demo cleanup failed', { message: err.message });
        return 0;
    } finally {
        cleanupRunning = false;
    }
}

/**
 * Clean up expired demo workspaces now and then on an interval, so removal
 * does not depend on new sign-ups. The timer does not keep the process alive.
 */
export function startDemoCleanup(intervalMs = DEMO_CLEANUP_INTERVAL_MS) {
    void runDemoCleanup();
    const timer = setInterval(() => void runDemoCleanup(), intervalMs);
    timer.unref();
    return timer;
}

/**
 * Create a private demo workspace: a temporary demo user that owns its own
 * copy of the sample documents.
 */
export async function createDemoWorkspace(now = new Date()) {
    const user = await User.create({
        email: `demo-${randomUUID()}@demo.invalid`,
        role: 'demo',
        password_hash: null,
        displayName: 'Demo User',
        expiresAt: new Date(now.getTime() + DEMO_TTL_MS),
    });

    const docs = await Document.insertMany(
        SAMPLE_DOCUMENTS.map((d) => ({ ...d, ownerId: user._id, demo: true })),
    );
    // The documents are new and have no chunks yet, so one insert is enough;
    // a transaction per document made this take seconds. Chat retrieval works
    // without chunks, so a failure here is logged, not fatal. A chunk with no
    // precomputed vector is saved without one.
    try {
        const chunks = docs
            .flatMap((doc) => buildDocumentChunks(doc))
            .map((chunk) => ({ ...chunk, embedding: SAMPLE_VECTORS[chunkKey(chunk.text)] }));
        await Chunk.insertMany(chunks);
    } catch (err) {
        logger.error('Building demo chunks failed', { message: err.message });
    }

    return user;
}

// Fictional accounts for the read-only Users screen in the demo, so real
// users' emails are never shown to demo visitors.
export const DEMO_SAMPLE_USERS = [
    { id: 'sample-1', email: 'dana.levi@northwind.example', displayName: 'Dana Levi', jobTitle: 'IT Manager', role: 'admin', status: 'active' },
    { id: 'sample-2', email: 'omer.katz@northwind.example', displayName: 'Omer Katz', jobTitle: 'Security Analyst', role: 'viewer', status: 'active' },
    { id: 'sample-3', email: 'maya.cohen@northwind.example', displayName: 'Maya Cohen', jobTitle: 'HR Partner', role: 'viewer', status: 'inactive' },
];
