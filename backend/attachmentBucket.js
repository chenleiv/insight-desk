import mongoose from 'mongoose';

// Attachment files live in this GridFS bucket on the default connection.
// GridFSBucket comes from mongoose.mongo so the bucket and the db handle use the same driver copy.
export function getAttachmentBucket() {
    return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'attachments' });
}
