import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { User, Document, Chunk } from './models.js';
import { deleteDocumentChunks } from './rag/syncChunks.js';
import { buildDocumentChunks } from './rag/buildChunks.js';
import { embeddingKey } from './rag/embeddingInput.js';
import { logger } from './logger.js';
import { getAttachmentBucket } from './attachmentBucket.js';
import { DEMO_LIMITS } from './access.js';

export const DEMO_TTL_MS = 24 * 60 * 60 * 1000;

const SAMPLE_DOCUMENTS = JSON.parse(
    readFileSync(new URL('./demo/sample-documents.json', import.meta.url), 'utf8'),
);

// Precomputed by `npm run embed:demo`, keyed by embeddingKey(title, text), so demo
// workspaces get vectors without loading the model in the server.
const SAMPLE_VECTORS = JSON.parse(
    readFileSync(new URL('./demo/sample-embeddings.json', import.meta.url), 'utf8'),
).vectors;

const missingVectors = SAMPLE_DOCUMENTS
    .flatMap((doc) => buildDocumentChunks(doc).map((chunk) => embeddingKey(doc.title, chunk.text)))
    .filter((key) => !SAMPLE_VECTORS[key]).length;
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
        const bucket = getAttachmentBucket();
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

/**
 * Remove the least recently active workspaces beyond the cap, never `keepUserId`. A new
 * visitor is never refused: otherwise one address could fill the cap and block the demo
 * for everyone until the workspaces expire. Parallel calls may remove one too many,
 * which costs an idle workspace; the count still settles at or under the cap.
 */
export async function enforceLiveWorkspaceCap(keepUserId) {
    const excess = await User.countDocuments({ role: 'demo' }) - DEMO_LIMITS.liveWorkspaces;
    if (excess <= 0) return 0;
    const leastActive = await User.find({ role: 'demo', _id: { $ne: keepUserId } }, '_id')
        .sort({ lastActiveAt: 1 })
        .limit(excess)
        .lean();
    const removed = await removeDemoWorkspaces({ _id: { $in: leastActive.map((u) => u._id) } });
    logger.info('Removed least active demo workspaces', { count: removed });
    return removed;
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
        demoDocuments: SAMPLE_DOCUMENTS.length,
        lastActiveAt: now,
    });

    const docs = await Document.insertMany(
        SAMPLE_DOCUMENTS.map((d) => ({ ...d, ownerId: user._id, demo: true })),
    );
    // The documents are new and have no chunks yet, so one insert is enough;
    // a transaction per document made this take seconds. Chat retrieval works
    // without chunks, so a failure here is logged, not fatal. A chunk with no
    // precomputed vector is saved without one.
    try {
        const chunks = docs.flatMap((doc) => buildDocumentChunks(doc).map((chunk) => {
            const key = embeddingKey(doc.title, chunk.text);
            return SAMPLE_VECTORS[key] ? { ...chunk, embedding: SAMPLE_VECTORS[key], embeddingKey: key } : chunk;
        }));
        await Chunk.insertMany(chunks);
    } catch (err) {
        logger.error('Building demo chunks failed', { message: err.message });
    }

    try {
        await enforceLiveWorkspaceCap(user._id);
    } catch (err) {
        // The visitor's workspace is fine, and the next new one tries again.
        logger.error('Removing least active demo workspaces failed', { message: err.message });
    }

    return user;
}

// Fictional accounts for the read-only Users screen in the demo, so real
// users' emails are never shown to demo visitors.
export const DEMO_SAMPLE_USERS = [
    { id: 'sample-1', email: 'dana.levi@insight-security.example', displayName: 'Dana Levi', jobTitle: 'IT Manager', role: 'admin', status: 'active' },
    { id: 'sample-2', email: 'omer.katz@insight-security.example', displayName: 'Omer Katz', jobTitle: 'Security Analyst', role: 'viewer', status: 'active' },
    { id: 'sample-3', email: 'maya.cohen@insight-security.example', displayName: 'Maya Cohen', jobTitle: 'HR Partner', role: 'viewer', status: 'inactive' },
];
