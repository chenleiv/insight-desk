import { Router } from 'express';
import { logger } from '../logger.js';
import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { Document } from '../models.js';
import { extractTextFromBuffer } from '../textExtract.js';
import { getCurrentUser, requireEditor } from '../auth.js';
import { canAccessDocument, documentScope, isDemoUser, DEMO_LIMITS } from '../access.js';
import { documentSchema, importBulkSchema, sendValidationError } from '../schemas.js';
import { syncDocumentChunks, deleteDocumentChunks } from '../rag/syncChunks.js';
import { embed } from '../rag/embed.js';
import { scheduleEmbeddingRetry } from '../rag/embedMissing.js';

const router = Router();

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const DEMO_CONTENT_LIMIT_MESSAGE =
    `Demo documents are limited to ${DEMO_LIMITS.contentLength.toLocaleString('en-US')} characters`;

function handleMulterUpload(req, res, next) {
    upload.single('file')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ detail: FILE_TOO_LARGE_MESSAGE });
            }
            return res.status(err.status || 400).json({ detail: err.message });
        }
        next();
    });
}

function handleZodError(err, res) {
    if (err.name === 'ZodError') {
        sendValidationError(res, err);
        return true;
    }
    return false;
}

// Each chunk gets an embedding so semantic search can find it right after the save;
// unchanged chunks keep theirs, so autosave after a small edit stays cheap.
// The document change is already saved, so a chunk failure is logged rather
// than failing the request. If embedding fails, the chunks are saved without
// embeddings so search never serves the old text, and a retry fills them in.
async function refreshChunks(docs) {
    for (const doc of [].concat(docs)) {
        try {
            await syncDocumentChunks(doc, undefined, { embed, reuseEmbeddings: true });
        } catch (err) {
            logger.error('Rebuilding chunks with embeddings failed', { message: err.message });
            try {
                await syncDocumentChunks(doc);
                scheduleEmbeddingRetry();
            } catch (fallbackErr) {
                logger.error('Rebuilding chunks failed', { message: fallbackErr.message });
            }
        }
    }
}

async function removeChunks(docIds) {
    try {
        await deleteDocumentChunks(docIds);
    } catch (err) {
        logger.error('Deleting chunks failed', { message: err.message });
    }
}

function getBucket() {
    return new GridFSBucket(mongoose.connection.db, { bucketName: 'attachments' });
}

const ALLOWED_ATTACHMENT_MIMES = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/plain',
    'text/markdown',
    'application/rtf',
    'text/rtf',
]);

// The largest file multer accepts. A bigger one is rejected with 413 and a message naming the limit.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const FILE_TOO_LARGE_MESSAGE =
    `File is too large. The maximum size is ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_ATTACHMENT_MIMES.has(file.mimetype)) {
            cb(null, true);
        } else {
            cb(Object.assign(new Error(`File type "${file.mimetype}" is not allowed`), { status: 400 }));
        }
    },
});

// Extract text from a file without creating any document (editors)
router.post('/extract-text', requireEditor, handleMulterUpload, async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ detail: 'No file uploaded' });
        const text = await extractTextFromBuffer(file.buffer, file.mimetype);
        res.json({ text, fileName: file.originalname });
    } catch (err) {
        logger.error('Text extraction failed', { message: err.message });
        res.status(500).json({ detail: 'Extraction failed' });
    }
});

// Export the documents the user can see (editors)
router.get('/export', requireEditor, async (req, res) => {
    try {
        const docs = await Document.find(documentScope(req.user));
        logger.info('Exporting docs', { count: docs.length });
        res.json(docs);
    } catch (err) {
        logger.error('Export failed', { message: err.message });
        res.status(500).json({ detail: 'Export failed' });
    }
});

// Bulk import (editors). Replace mode only replaces the documents the user can see.
router.post('/import-bulk', requireEditor, async (req, res) => {
    if (isDemoUser(req.user)) {
        return res.status(403).json({ detail: 'Import is not available in the demo' });
    }
    try {
        const { mode, documents } = importBulkSchema.parse(req.body);
        const demoFlag = isDemoUser(req.user) ? { demo: true } : {};
        const normalized = documents.map(({ _id, id, ...rest }) => ({ ...rest, ownerId: req.user._id, ...demoFlag }));
        // One transaction: a failed import leaves existing documents and chunks untouched.
        let inserted = [];
        await Document.db.transaction(async (session) => {
            if (mode === 'replace') {
                const existing = await Document.find(documentScope(req.user), '_id', { session });
                await Document.deleteMany({ _id: { $in: existing.map((d) => d._id) } }, { session });
                await deleteDocumentChunks(existing.map((d) => d._id), session);
            }
            inserted = await Document.insertMany(normalized, { session });
            for (const doc of inserted) await syncDocumentChunks(doc, session);
        });
        // Embeddings are added after the commit, so the slow model calls never hold the transaction open.
        await refreshChunks(inserted);
        res.json({ inserted: normalized.length, mode });
    } catch (err) {
        logger.error('Import failed', { message: err.message });
        if (handleZodError(err, res)) return;
        res.status(500).json({ detail: 'Import failed' });
    }
});

// List the documents the user can see
router.get('/', getCurrentUser, async (req, res) => {
    try {
        const docs = await Document.find(documentScope(req.user)).sort({ createdAt: -1 });
        res.json(docs);
    } catch (err) {
        logger.error('Fetching documents', { message: err.message });
        res.status(500).json({ detail: 'Error fetching documents' });
    }
});

// Get single document
router.get('/:id', getCurrentUser, async (req, res) => {
    try {
        const doc = await Document.findById(req.params.id);
        if (!canAccessDocument(req.user, doc)) {
            return res.status(404).json({ detail: 'Not found' });
        }
        res.json(doc);
    } catch (err) {
        logger.error('Fetching document by ID', { message: err.message });
        res.status(500).json({ detail: 'Error fetching document' });
    }
});

// Create document
router.post('/', requireEditor, async (req, res) => {
    try {
        const validated = documentSchema.parse(req.body);
        if (isDemoUser(req.user)) {
            if (validated.content.length > DEMO_LIMITS.contentLength) {
                return res.status(400).json({ detail: DEMO_CONTENT_LIMIT_MESSAGE });
            }
            if (await Document.countDocuments(documentScope(req.user)) >= DEMO_LIMITS.documents) {
                return res.status(403).json({
                    detail: `Demo workspaces are limited to ${DEMO_LIMITS.documents} documents`,
                });
            }
        }
        const newDoc = await Document.create({
            ...validated,
            ownerId: req.user._id,
            ...(isDemoUser(req.user) && { demo: true }),
        });
        await refreshChunks(newDoc);
        res.json(newDoc);
    } catch (err) {
        logger.error('Creating document', { message: err.message });
        if (handleZodError(err, res)) return;
        res.status(500).json({ detail: 'Error creating document' });
    }
});

// Update document
router.put('/:id', requireEditor, async (req, res) => {
    try {
        const validated = documentSchema.parse(req.body);
        if (!canAccessDocument(req.user, await Document.findById(req.params.id))) {
            return res.status(404).json({ detail: 'Not found' });
        }
        if (isDemoUser(req.user) && validated.content.length > DEMO_LIMITS.contentLength) {
            return res.status(400).json({ detail: DEMO_CONTENT_LIMIT_MESSAGE });
        }
        const updated = await Document.findByIdAndUpdate(req.params.id, validated, { new: true });
        if (!updated) {
            return res.status(404).json({ detail: 'Not found' });
        }
        await refreshChunks(updated);
        res.json(updated);
    } catch (err) {
        logger.error('Updating document', { message: err.message });
        if (handleZodError(err, res)) return;
        res.status(500).json({ detail: 'Error updating document' });
    }
});

// Delete document
router.delete('/:id', requireEditor, async (req, res) => {
    try {
        if (!canAccessDocument(req.user, await Document.findById(req.params.id))) {
            return res.status(404).json({ detail: 'Not found' });
        }
        const deleted = await Document.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ detail: 'Not found' });
        }
        // Delete all GridFS files for this document's attachments
        if (deleted.attachments?.length) {
            const bucket = getBucket();
            await Promise.all(
                deleted.attachments
                    .filter(a => a.gridfsId)
                    .map(a => bucket.delete(a.gridfsId).catch(() => {}))
            );
        }
        await removeChunks(deleted._id);
        res.status(204).send();
    } catch (err) {
        logger.error('Deleting document', { message: err.message });
        res.status(500).json({ detail: 'Error deleting document' });
    }
});

// Toggle favorite
router.post('/:id/toggle-favorite', getCurrentUser, async (req, res) => {
    try {
        const docId = req.params.id;
        const user = req.user;
        if (!canAccessDocument(user, await Document.findById(docId))) {
            return res.status(404).json({ detail: 'Not found' });
        }

        const isFavorite = user.favorites.includes(docId);
        if (isFavorite) {
            user.favorites.pull(docId);
        } else {
            user.favorites.addToSet(docId);
        }

        await user.save();
        res.json({ favorites: user.favorites });
    } catch (err) {
        logger.error('Toggle favorite failed', { message: err.message });
        res.status(500).json({ detail: 'Server error' });
    }
});

// Stream attachment file
router.get('/:id/attachments/:attachmentId/file', getCurrentUser, async (req, res) => {
    try {
        const doc = await Document.findById(req.params.id);
        if (!canAccessDocument(req.user, doc)) return res.status(404).json({ detail: 'Not found' });

        const attachment = doc.attachments.id(req.params.attachmentId);
        if (!attachment || !attachment.gridfsId) return res.status(404).json({ detail: 'Attachment not found' });

        const bucket = getBucket();
        const downloadStream = bucket.openDownloadStream(attachment.gridfsId);

        res.set('Content-Type', attachment.fileType);
        res.set('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.fileName)}"`);

        downloadStream.on('error', () => res.status(404).end());
        downloadStream.pipe(res);
    } catch (err) {
        logger.error('Stream attachment failed', { message: err.message });
        res.status(500).json({ detail: 'Error streaming file' });
    }
});

// Upload attachment
router.post('/:id/attachments', requireEditor, handleMulterUpload, async (req, res) => {
    try {
        const doc = await Document.findById(req.params.id);
        if (!canAccessDocument(req.user, doc)) return res.status(404).json({ detail: 'Not found' });
        if (isDemoUser(req.user) && doc.attachments.length >= DEMO_LIMITS.attachmentsPerDocument) {
            return res.status(403).json({
                detail: `Demo documents are limited to ${DEMO_LIMITS.attachmentsPerDocument} attachment`,
            });
        }

        const file = req.file;
        if (!file) return res.status(400).json({ detail: 'No file uploaded' });

        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        const attachmentId = new mongoose.Types.ObjectId();

        // Upload to GridFS
        const bucket = getBucket();
        const uploadStream = bucket.openUploadStream(`${randomUUID()}-${safeName}`, {
            contentType: file.mimetype,
            metadata: { docId: req.params.id, attachmentId: attachmentId.toString() },
        });
        uploadStream.end(file.buffer);
        await new Promise((resolve, reject) => {
            uploadStream.on('finish', resolve);
            uploadStream.on('error', reject);
        });

        const fileUrl = `${BACKEND_URL}/api/documents/${req.params.id}/attachments/${attachmentId}/file`;
        const extractedText = await extractTextFromBuffer(file.buffer, file.mimetype);

        doc.attachments.push({
            _id: attachmentId,
            url: fileUrl,
            fileName: file.originalname,
            fileType: file.mimetype,
            extractedText,
            gridfsId: uploadStream.id,
        });
        await doc.save();
        await refreshChunks(doc);

        res.json(doc.attachments[doc.attachments.length - 1]);
    } catch (err) {
        logger.error('Upload attachment failed', { message: err.message });
        res.status(500).json({ detail: 'Upload failed' });
    }
});

// Delete attachment
router.delete('/:id/attachments/:attachmentId', requireEditor, async (req, res) => {
    try {
        const doc = await Document.findById(req.params.id);
        if (!canAccessDocument(req.user, doc)) return res.status(404).json({ detail: 'Not found' });

        const attachment = doc.attachments.id(req.params.attachmentId);
        if (!attachment) return res.status(404).json({ detail: 'Attachment not found' });

        if (attachment.gridfsId) {
            const bucket = getBucket();
            await bucket.delete(attachment.gridfsId).catch(() => {});
        }

        doc.attachments.pull({ _id: req.params.attachmentId });
        await doc.save();
        await refreshChunks(doc);

        res.status(204).send();
    } catch (err) {
        logger.error('Delete attachment failed', { message: err.message });
        res.status(500).json({ detail: 'Delete failed' });
    }
});

export default router;
