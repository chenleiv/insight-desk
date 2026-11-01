// Bring the Chunk collection up to date with every document's content and
// attachments: split each document with the current chunker and embed every
// chunk whose title, text, embedding format or model changed. Unchanged
// documents are not written, so running it again does nothing. Demo documents
// are skipped; they expire within a day and new ones get fresh vectors.
// Documents are read one at a time, so memory stays flat on a large database.
// Usage: npm run reindex [-- --dry-run]
import '../loadEnv.js';
import mongoose from 'mongoose';
import { Document, Chunk } from '../models.js';
import { reindexDocument } from '../rag/reindexDocument.js';
import { embed } from '../rag/embed.js';

const dryRun = process.argv.includes('--dry-run');

async function reindex() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not defined');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    if (!dryRun) await Chunk.syncIndexes();

    const prefix = dryRun ? '[dry run] ' : '';
    const totals = { docs: 0, changed: 0, chunks: 0, embedded: 0, reused: 0 };

    for await (const doc of Document.find({ demo: { $ne: true } }).lean().cursor()) {
        const r = await reindexDocument(doc, { embed, dryRun });
        totals.docs++;
        if (r.changed) totals.changed++;
        totals.chunks += r.chunks;
        totals.embedded += r.embedded;
        totals.reused += r.reused;
        const verb = dryRun ? 'would embed' : 'embedded';
        const state = r.changed ? '' : ', unchanged';
        console.log(`${prefix}${doc.title}: ${r.chunks} chunks, ${verb} ${r.embedded}, reused ${r.reused}${state}`);
    }
    const demoDocs = await Document.countDocuments({ demo: true });

    // Drop chunks left behind by documents that no longer exist, demo ones included.
    const orphans = { docId: { $nin: await Document.distinct('_id') } };
    const removed = dryRun ? await Chunk.countDocuments(orphans) : (await Chunk.deleteMany(orphans)).deletedCount;

    const verb = dryRun ? 'would embed' : 'embedded';
    console.log(`${prefix}${totals.docs} documents (${demoDocs} demo skipped), ${totals.changed} ${dryRun ? 'to rewrite' : 'rewritten'}: `
        + `${totals.chunks} chunks, ${verb} ${totals.embedded}, reused ${totals.reused}.`);
    if (removed) console.log(`${prefix}${dryRun ? 'Would remove' : 'Removed'} ${removed} orphaned chunks.`);
}

reindex()
    .catch((err) => {
        console.error('Reindex failed:', err.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
