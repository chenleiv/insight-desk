import { Router } from 'express';
import { logger } from '../logger.js';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { Document } from '../models.js';
import { extractTextFromBuffer } from '../textExtract.js';
import { getCurrentUser, requireAdmin } from '../auth.js';
import { documentSchema, importBulkSchema } from '../schemas.js';

const router = Router();

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    : null;

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

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_ATTACHMENT_MIMES.has(file.mimetype)) {
            cb(null, true);
        } else {
            cb(Object.assign(new Error(`File type "${file.mimetype}" is not allowed`), { status: 400 }));
        }
    },
});

// Export all documents (admin)
router.get('/export', requireAdmin, async (req, res) => {
    try {
        const docs = await Document.find();
        logger.info('Exporting docs', { count: docs.length });
        res.json(docs);
    } catch (err) {
        logger.error('Export failed', { message: err.message });
        res.status(500).json({ detail: 'Export failed' });
    }
});

// Bulk import (admin)
router.post('/import-bulk', requireAdmin, async (req, res) => {
    try {
        const { mode, documents } = importBulkSchema.parse(req.body);
        if (mode === 'replace') {
            await Document.deleteMany({});
        }
        const normalized = documents.map(d => {
            const { _id, id, ...rest } = d;
            return rest;
        });
        await Document.insertMany(normalized);
        const result = await Document.find();
        res.json(result);
    } catch (err) {
        logger.error('Import failed', { message: err.message });
        if (err.name === 'ZodError') {
            return res.status(400).json({ detail: 'Validation failed', errors: err.errors });
        }
        res.status(500).json({ detail: 'Import failed' });
    }
});

// List all documents
router.get('/', getCurrentUser, async (req, res) => {
    try {
        const docs = await Document.find().sort({ createdAt: -1 });
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
        if (!doc) {
            return res.status(404).json({ detail: 'Not found' });
        }
        res.json(doc);
    } catch (err) {
        logger.error('Fetching document by ID', { message: err.message });
        res.status(500).json({ detail: 'Error fetching document' });
    }
});

// Create document
router.post('/', requireAdmin, async (req, res) => {
    try {
        const validated = documentSchema.parse(req.body);
        const newDoc = await Document.create(validated);
        res.json(newDoc);
    } catch (err) {
        logger.error('Creating document', { message: err.message });
        if (err.name === 'ZodError') {
            return res.status(400).json({ detail: 'Validation failed', errors: err.errors });
        }
        res.status(500).json({ detail: 'Error creating document' });
    }
});

// Update document
router.put('/:id', requireAdmin, async (req, res) => {
    try {
        const validated = documentSchema.parse(req.body);
        const updated = await Document.findByIdAndUpdate(req.params.id, validated, { new: true });
        if (!updated) {
            return res.status(404).json({ detail: 'Not found' });
        }
        res.json(updated);
    } catch (err) {
        logger.error('Updating document', { message: err.message });
        if (err.name === 'ZodError') {
            return res.status(400).json({ detail: 'Validation failed', errors: err.errors });
        }
        res.status(500).json({ detail: 'Error updating document' });
    }
});

// Delete document
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const deleted = await Document.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ detail: 'Not found' });
        }
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

// Upload attachment
router.post('/:id/attachments', requireAdmin, (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400);
            return res.status(status).json({ detail: err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!supabase) return res.status(503).json({ detail: 'Storage not configured' });

        const doc = await Document.findById(req.params.id);
        if (!doc) return res.status(404).json({ detail: 'Not found' });

        const file = req.file;
        if (!file) return res.status(400).json({ detail: 'No file uploaded' });

        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${req.params.id}/${randomUUID()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
            .from('document-attachments')
            .upload(storagePath, file.buffer, { contentType: 'application/octet-stream', upsert: false });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
            .from('document-attachments')
            .getPublicUrl(storagePath);

        const extractedText = await extractTextFromBuffer(file.buffer, file.mimetype);
        doc.attachments.push({ url: publicUrl, fileName: file.originalname, fileType: file.mimetype, extractedText });
        await doc.save();

        res.json(doc.attachments[doc.attachments.length - 1]);
    } catch (err) {
        logger.error('Upload attachment failed', { message: err.message });
        res.status(500).json({ detail: err.message || 'Upload failed' });
    }
});

// Delete attachment
router.delete('/:id/attachments/:attachmentId', requireAdmin, async (req, res) => {
    try {
        if (!supabase) return res.status(503).json({ detail: 'Storage not configured' });

        const doc = await Document.findById(req.params.id);
        if (!doc) return res.status(404).json({ detail: 'Not found' });

        const attachment = doc.attachments.id(req.params.attachmentId);
        if (!attachment) return res.status(404).json({ detail: 'Attachment not found' });

        const marker = '/document-attachments/';
        const idx = attachment.url.indexOf(marker);
        if (idx !== -1) {
            const storagePath = attachment.url.slice(idx + marker.length);
            await supabase.storage.from('document-attachments').remove([storagePath]);
        }

        doc.attachments.pull({ _id: req.params.attachmentId });
        await doc.save();

        res.status(204).send();
    } catch (err) {
        logger.error('Delete attachment failed', { message: err.message });
        res.status(500).json({ detail: err.message || 'Delete failed' });
    }
});

export default router;
