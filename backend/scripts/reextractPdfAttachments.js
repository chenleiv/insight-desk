// One-off repair: re-extract text for PDF attachments saved with empty text
// while PDF extraction was broken, then rebuild those documents' chunks.
// Safe to re-run: attachments that already have text are skipped.
// Usage: npm run reextract:pdf [-- --dry-run]
import '../loadEnv.js';
import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';
import { Document } from '../models.js';
import { extractTextFromBuffer } from '../textExtract.js';
import { syncDocumentChunks } from '../rag/syncChunks.js';

const PDF_MIME = 'application/pdf';
const dryRun = process.argv.includes('--dry-run');

async function readFile(bucket, id) {
    const parts = [];
    for await (const part of bucket.openDownloadStream(id)) parts.push(part);
    return Buffer.concat(parts);
}

async function reextract() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not defined');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'attachments' });

    const docs = await Document.find({
        attachments: { $elemMatch: { fileType: PDF_MIME, extractedText: '', gridfsId: { $ne: null } } },
    }).lean();

    let fixed = 0;
    let failed = 0;

    for (const doc of docs) {
        const pending = doc.attachments.filter(
            (a) => a.fileType === PDF_MIME && !a.extractedText && a.gridfsId,
        );
        let changed = false;

        for (const attachment of pending) {
            const text = await extractTextFromBuffer(await readFile(bucket, attachment.gridfsId), PDF_MIME);
            if (!text) {
                failed++;
                console.log(`${doc.title} / ${attachment.fileName}: no text extracted`);
                continue;
            }
            fixed++;
            console.log(`${doc.title} / ${attachment.fileName}: ${text.length} chars`);
            if (dryRun) continue;
            await Document.updateOne(
                { _id: doc._id, 'attachments._id': attachment._id },
                { $set: { 'attachments.$.extractedText': text } },
            );
            changed = true;
        }

        if (changed) await syncDocumentChunks(await Document.findById(doc._id).lean());
    }

    const prefix = dryRun ? '[dry run] would update' : 'Updated';
    console.log(`${prefix} ${fixed} PDF attachments in ${docs.length} documents.`);
    if (failed) console.log(`${failed} attachments still have no text (scanned images or unreadable files).`);
}

reextract()
    .catch((err) => {
        console.error('Re-extraction failed:', err.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
