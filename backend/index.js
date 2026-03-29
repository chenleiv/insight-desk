import './loadEnv.js';
import express from 'express';
import mongoose from 'mongoose';
import compression from 'compression';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import authRouter, { getCurrentUser, requireAdmin, seedUsersIfEmpty } from './auth.js';
import aiRouter from './ai.js';
import { Document } from './models.js';
import fs from 'fs';

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { documentSchema, importBulkSchema } from './schemas.js';

const app = express();
app.use(compression());

// --- Static Hosting (Prioritized for SPA performance and stability) ---
const distPath = path.resolve(__dirname, '../dist');

if (process.env.NODE_ENV === 'production') {
    console.log('Production mode: Serving static files from', distPath);
}

app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
        if (filePath.includes('/assets/')) {
            // Cache for one year (31536000 seconds)
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
            // Do not cache (always check with the server)
            res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        }
    }
}));

// Simple Request Logger (Useful for health monitoring)
app.use((req, res, next) => {
    if (process.env.NODE_ENV !== 'production' || req.url.startsWith('/api')) {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    }
    next();
});

// Security Headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "'unsafe-inline'"],
            "connect-src": ["'self'", "https://*"],
            "img-src": ["'self'", "data:", "https://*"],
        },
    },
}));

const PORT = process.env.PORT || 8000;

// CORS must run BEFORE rate limiter so error responses (429) include CORS headers
const allowOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow same-site requests (no origin) or allowed origins
        if (!origin || allowOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`CORS Warning: Request from unauthorized origin: ${origin}. Allowing anyway but browser may block if credentials needed.`);
            // On real production we'll throw an error CORS not allowed.
            callback(null, true); 
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate Limiting (after CORS so 429 responses get CORS headers)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Relax when not in production
    standardHeaders: true,
    legacyHeaders: false,
    message: { detail: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Connect to MongoDB
if (!process.env.MONGODB_URI) {
    console.error('CRITICAL: MONGODB_URI is not defined in environment variables.');
} else {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => {
            console.log('SUCCESS: Connected to MongoDB');
            seedUsersIfEmpty(); // Seed after connection
        })
        .catch(err => {
            console.error('ERROR: MongoDB connection failed:', err.message);
        });
}

app.use(express.json({ limit: '10kb' })); // Limit body size
app.use(cookieParser());

// Auth routes
app.use('/api/auth', authRouter);

// AI routes
app.use(aiRouter);

// Health check
app.get('/health', (req, res) => {
    res.json({ ok: true });
});

// --- Admin tools (export/import) ---

app.get('/api/documents/export', requireAdmin, async (req, res) => {
    try {
        const docs = await Document.find();
        console.log('exporting docs', docs);
        res.json(docs);
    } catch (err) {
        console.error('Export failed:', err);
        res.status(500).json({ detail: 'Export failed' });
    }
});

app.post('/api/documents/import-bulk', requireAdmin, async (req, res) => {
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
        console.error('Import failed:', err);
        if (err.name === 'ZodError') {
            return res.status(400).json({ detail: 'Validation failed', errors: err.errors });
        }
        res.status(500).json({ detail: 'Import failed' });
    }
});

// --- Documents CRUD ---

app.get('/api/documents', getCurrentUser, async (req, res) => {
    try {
        const docs = await Document.find().sort({ createdAt: -1 });
        res.json(docs);
    } catch (err) {
        console.error('Error fetching documents:', err);
        res.status(500).json({ detail: 'Error fetching documents' });
    }
});

app.get('/api/documents/:id', getCurrentUser, async (req, res) => {
    try {
        const doc = await Document.findById(req.params.id);
        if (!doc) {
            return res.status(404).json({ detail: 'Not found' });
        }
        res.json(doc);
    } catch (err) {
        console.error('Error fetching document by ID:', err);
        res.status(500).json({ detail: 'Error fetching document' });
    }
});

app.post('/api/documents', requireAdmin, async (req, res) => {
    try {
        const validated = documentSchema.parse(req.body);
        const newDoc = await Document.create(validated);
        res.json(newDoc);
    } catch (err) {
        console.error('Error creating document:', err);
        if (err.name === 'ZodError') {
            return res.status(400).json({ detail: 'Validation failed', errors: err.errors });
        }
        res.status(500).json({ detail: 'Error creating document' });
    }
});

app.put('/api/documents/:id', requireAdmin, async (req, res) => {
    try {
        const validated = documentSchema.parse(req.body);
        const updated = await Document.findByIdAndUpdate(req.params.id, validated, { new: true });
        if (!updated) {
            return res.status(404).json({ detail: 'Not found' });
        }
        res.json(updated);
    } catch (err) {
        console.error('Error updating document:', err);
        if (err.name === 'ZodError') {
            return res.status(400).json({ detail: 'Validation failed', errors: err.errors });
        }
        res.status(500).json({ detail: 'Error updating document' });
    }
});

app.delete('/api/documents/:id', requireAdmin, async (req, res) => {
    try {
        const deleted = await Document.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ detail: 'Not found' });
        }
        res.status(204).send();
    } catch (err) {
        console.error('Error deleting document:', err);
        res.status(500).json({ detail: 'Error deleting document' });
    }
});

app.post('/api/documents/:id/toggle-favorite', getCurrentUser, async (req, res) => {
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
        console.error('Toggle favorite failed:', err);
        res.status(500).json({ detail: 'Server error' });
    }
});



app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send('User-agent: *\nAllow: /');
});

// Handle SPA routing: return index.html for all non-api routes
app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
        if (err) {
            console.error('Error sending index.html:', err);
            res.status(500).send('Frontend application is currently unavailable. Please check backend logs.');
        }
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
