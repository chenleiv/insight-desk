import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';

// Attachment files live in this GridFS bucket on the default connection.
export function getAttachmentBucket() {
    return new GridFSBucket(mongoose.connection.db, { bucketName: 'attachments' });
}
