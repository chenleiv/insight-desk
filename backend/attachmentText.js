import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';
import { logger } from './logger.js';
import { extractTextFromBuffer } from './textExtract.js';

async function readGridfsFile(id) {
    const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'attachments' });
    const parts = [];
    for await (const part of bucket.openDownloadStream(id)) parts.push(part);
    return Buffer.concat(parts);
}

/**
 * Extract text for an attachment that was saved without it, from the file we store.
 * Only GridFS files are read: URL-only legacy attachments return '' so the server
 * never fetches a URL taken from the database.
 */
export async function extractStoredAttachmentText(attachment, readFile = readGridfsFile) {
    if (!attachment.gridfsId) return '';
    try {
        return await extractTextFromBuffer(await readFile(attachment.gridfsId), attachment.fileType);
    } catch (err) {
        logger.error('Reading stored attachment failed', { message: err.message });
        return '';
    }
}
