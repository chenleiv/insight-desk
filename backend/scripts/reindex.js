// Rebuild the Chunk collection from every document's content and attachments.
// Usage: npm run reindex [-- --dry-run]
import '../loadEnv.js';
import mongoose from 'mongoose';
import { Document, Chunk } from '../models.js';
import { buildDocumentChunks } from '../rag/buildChunks.js';
import { syncDocumentChunks } from '../rag/syncChunks.js';

const dryRun = process.argv.includes('--dry-run');

async function reindex() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not defined');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    if (!dryRun) await Chunk.syncIndexes();

    const docs = await Document.find().lean();
    let total = 0;

    for (const doc of docs) {
        const count = dryRun
            ? buildDocumentChunks(doc).length
            : await syncDocumentChunks(doc);
        total += count;
        console.log(`${doc.title}: ${count} chunks`);
    }

    // Drop chunks left behind by documents that no longer exist.
    const removed = dryRun
        ? 0
        : (await Chunk.deleteMany({ docId: { $nin: docs.map((d) => d._id) } })).deletedCount;

    const prefix = dryRun ? '[dry run] would create' : 'Created';
    console.log(`${prefix} ${total} chunks for ${docs.length} documents.`);
    if (removed) console.log(`Removed ${removed} orphaned chunks.`);
}

reindex()
    .catch((err) => {
        console.error('Reindex failed:', err.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
