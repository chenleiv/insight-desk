import './loadEnv.js';
import express from 'express';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { logger } from './logger.js';
import { applyMiddleware } from './middleware/setup.js';
import authRouter, { seedUsersIfEmpty } from './auth.js';
import aiRouter, { loadAIConfig } from './ai.js';
import documentsRouter from './routes/documents.js';
import usersRouter from './routes/users.js';

const app = express();
const PORT = process.env.PORT || 8000;
const distPath = path.resolve(__dirname, '../dist');

// Static file serving
app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
        if (filePath.includes('/assets/')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        }
    }
}));

// Request logger
app.use((req, res, next) => {
    if (process.env.NODE_ENV !== 'production' || req.url.startsWith('/api')) {
        logger.info(`${req.method} ${req.url}`);
    }
    next();
});

// Security, CORS, and rate limiting
applyMiddleware(app);

// MongoDB connection
if (!process.env.MONGODB_URI) {
    logger.error('CRITICAL: MONGODB_URI is not defined in environment variables');
} else {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => {
            logger.info('Connected to MongoDB');
            seedUsersIfEmpty();
            loadAIConfig();
        })
        .catch(err => {
            logger.error('MongoDB connection failed', { message: err.message });
        });
}

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Routes
app.use('/api/auth', authRouter);
app.use(aiRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/users', usersRouter);

// Health check
app.get('/health', (req, res) => {
    res.json({ ok: true });
});

app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send('User-agent: *\nAllow: /');
});

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
        if (err) {
            logger.error('Error sending index.html', { message: err.message });
            res.status(500).send('Frontend application is currently unavailable. Please check backend logs.');
        }
    });
});

const server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT', () => { server.close(() => process.exit(0)); });
