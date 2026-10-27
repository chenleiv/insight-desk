import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';
import { User, Document } from './models.js';
import { syncDocumentChunks, deleteDocumentChunks } from './rag/syncChunks.js';
import { logger } from './logger.js';

export const DEMO_TTL_MS = 24 * 60 * 60 * 1000;

const SAMPLE_DOCUMENTS = JSON.parse(
    readFileSync(new URL('./demo/sample-documents.json', import.meta.url), 'utf8'),
);

/**
 * Remove demo workspaces whose time is up: their GridFS files, chunks,
 * documents and the demo users themselves. Returns how many were removed.
 */
export async function removeExpiredDemoWorkspaces(now = new Date()) {
    const expired = await User.find({ role: 'demo', expiresAt: { $lt: now } }, '_id').lean();
    if (!expired.length) return 0;

    const userIds = expired.map((u) => u._id);
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

/**
 * Create a private demo workspace: a temporary demo user that owns its own
 * copy of the sample documents. Expired workspaces are cleaned up first.
 */
export async function createDemoWorkspace(now = new Date()) {
    try {
        const removed = await removeExpiredDemoWorkspaces(now);
        if (removed) logger.info('Removed expired demo workspaces', { count: removed });
    } catch (err) {
        logger.error('Demo cleanup failed', { message: err.message });
    }

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
    // Chat retrieval works without chunks, so a failure here is logged, not fatal.
    try {
        for (const doc of docs) await syncDocumentChunks(doc);
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
