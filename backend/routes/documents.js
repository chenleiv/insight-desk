import { Router } from 'express';
import { logger } from '../logger.js';
import mongoose from 'mongoose';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import { Document } from '../models.js';
import { getAttachmentBucket } from '../attachmentBucket.js';
import { extractTextFromBuffer } from '../textExtract.js';
import { signatureError } from '../fileSignature.js';
import { getCurrentUser, requireEditor } from '../auth.js';
import { canAccessDocument, documentScope, isDemoUser, DEMO_LIMITS } from '../access.js';
import { documentSchema, documentDownloadQuerySchema, importBulkSchema, sendValidationError } from '../schemas.js';
import { exportDocument, ExportError } from '../documentExport.js';
import { syncDocumentChunks, deleteDocumentChunks } from '../rag/syncChunks.js';
import { embed } from '../rag/embed.js';
import { scheduleEmbeddingRetry } from '../rag/embedMissing.js';
import {
    MAX_UPLOAD_BYTES,
    FILE_TOO_LARGE_MESSAGE,
    resolveUploadMime,
    fileTypeNotAllowedMessage,
} from '../../shared/uploadRules.js';

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
        const mismatch = req.file && signatureError(req.file.buffer, req.file.mimetype);
        if (mismatch) return res.status(400).json({ detail: mismatch });
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

// An upload the extractor refused: a limit (422) or a full queue (503), with a safe message.
function handleExtractionError(err, res) {
    if (!err.isExtractionError) return false;
    if (err.retryAfter) res.set('Retry-After', String(err.retryAfter));
    res.status(err.status).json({ detail: err.message });
    return true;
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

// The largest file multer accepts. A bigger one is rejected with 413 and a message naming the limit.
export { MAX_UPLOAD_BYTES };

// Every upload is parsed in a child process, one at a time, so one client must not
// keep that queue full. Per client IP, which needs TRUST_PROXY_HOPS set behind a proxy.
export const UPLOAD_RATE_LIMIT = 20;
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: UPLOAD_RATE_LIMIT,
    standardHeaders: true,
    legacyHeaders: false,
    message: { detail: 'Too many uploads, please try again in 15 minutes.' },
});

const MAX_FILE_NAME_LENGTH = 255;

// The allowed types live in shared/uploadRules.js, which the UI uses too. A file the
// browser sent with no type or a generic one gets its extension's type.
const upload = multer({
    storage: multer.memoryStorage(),
    // One file and nothing else: the UI sends no other parts, and each would use memory.
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 1, headerPairs: 20 },
    fileFilter: (_req, file, cb) => {
        if (file.originalname.length > MAX_FILE_NAME_LENGTH) {
            cb(Object.assign(new Error('The file name is too long.'), { status: 400 }));
            return;
        }
        const mimeType = resolveUploadMime(file.originalname, file.mimetype);
        if (mimeType) {
            file.mimetype = mimeType;
            cb(null, true);
        } else {
            cb(Object.assign(new Error(fileTypeNotAllowedMessage(file.mimetype)), { status: 400 }));
        }
    },
});

// Extract text from a file without creating any document (editors)
router.post('/extract-text', requireEditor, uploadLimiter, handleMulterUpload, async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ detail: 'No file uploaded' });
        const text = await extractTextFromBuffer(file.buffer, file.mimetype);
        res.json({ text, fileName: file.originalname });
    } catch (err) {
        if (handleExtractionError(err, res)) return;
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

// Download one document as a file. Same access rule as reading it.
router.get('/:id/download', getCurrentUser, async (req, res) => {
    try {
        const { format } = documentDownloadQuerySchema.parse(req.query);
        const doc = await Document.findById(req.params.id);
        if (!canAccessDocument(req.user, doc)) {
            return res.status(404).json({ detail: 'Not found' });
        }
        const { body, fileName, contentType } = await exportDocument(doc, format);
        // attachment() encodes the name for Content-Disposition (ASCII fallback plus filename*).
        res.attachment(fileName);
        res.set({
            'Content-Type': contentType,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-store',
        });
        res.send(body);
    } catch (err) {
        if (handleZodError(err, res)) return;
        if (err instanceof ExportError) return res.status(err.status).json({ detail: err.message });
        logger.error('Downloading document', { message: err.message });
        res.status(500).json({ detail: 'Error downloading document' });
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
            const bucket = getAttachmentBucket();
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

        const bucket = getAttachmentBucket();
        const downloadStream = bucket.openDownloadStream(attachment.gridfsId);

        // Served as a download with the type of its allowed extension, never sniffed,
        // so a stored file cannot render as a page on this origin.
        res.attachment(attachment.fileName);
        res.set({
            'Content-Type': resolveUploadMime(attachment.fileName, attachment.fileType) || 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff',
        });

        downloadStream.on('error', () => res.status(404).end());
        downloadStream.pipe(res);
    } catch (err) {
        logger.error('Stream attachment failed', { message: err.message });
        res.status(500).json({ detail: 'Error streaming file' });
    }
});

// Upload attachment
router.post('/:id/attachments', requireEditor, uploadLimiter, handleMulterUpload, async (req, res) => {
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
        // Before the file is stored, so a failure here leaves nothing behind.
        const extractedText = await extractTextFromBuffer(file.buffer, file.mimetype);

        // Upload to GridFS
        const bucket = getAttachmentBucket();
        const uploadStream = bucket.openUploadStream(`${randomUUID()}-${safeName}`, {
            contentType: file.mimetype,
            metadata: { docId: req.params.id, attachmentId: attachmentId.toString() },
        });
        try {
            uploadStream.end(file.buffer);
            await new Promise((resolve, reject) => {
                uploadStream.on('finish', resolve);
                uploadStream.on('error', reject);
            });

            const fileUrl = `${BACKEND_URL}/api/documents/${req.params.id}/attachments/${attachmentId}/file`;
            doc.attachments.push({
                _id: attachmentId,
                url: fileUrl,
                fileName: file.originalname,
                fileType: file.mimetype,
                extractedText,
                gridfsId: uploadStream.id,
            });
            await doc.save();
        } catch (err) {
            // The document does not reference the file, so remove it rather than leave it orphaned.
            await bucket.delete(uploadStream.id).catch(() => {});
            throw err;
        }
        await refreshChunks(doc);

        res.json(doc.attachments[doc.attachments.length - 1]);
    } catch (err) {
        if (handleExtractionError(err, res)) return;
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
            const bucket = getAttachmentBucket();
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
