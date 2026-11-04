import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';

import { logger } from './logger.js';
import { applyMiddleware, apiNotFound, jsonBody, spaFallbackLimiter } from './middleware/setup.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRouter from './auth.js';
import aiRouter from './ai.js';
import documentsRouter from './routes/documents.js';
import usersRouter from './routes/users.js';
import healthRouter from './routes/health.js';

// The app without its database connection or listening port, so a test can
// measure the real middleware and route order.
export function createApp({ distPath }) {
    const app = express();

    // Request logger
    app.use((req, res, next) => {
        if (process.env.NODE_ENV !== 'production' || req.url.startsWith('/api')) {
            logger.info(`${req.method} ${req.url}`);
        }
        next();
    });

    // Security, CORS, and rate limiting
    applyMiddleware(app);

    // Static file serving. After the security layer, so these responses get its headers and compression.
    app.use(express.static(distPath, {
        setHeaders: (res, filePath) => {
            if (filePath.includes('/assets/')) {
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            } else {
                res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
            }
        }
    }));

    app.use(jsonBody());
    app.use(cookieParser());

    // Routes
    app.use('/api/auth', authRouter);
    app.use(aiRouter);
    app.use('/api/documents', documentsRouter);
    app.use('/api/users', usersRouter);

    // Health check
    app.use(healthRouter);

    app.get('/robots.txt', (req, res) => {
        res.type('text/plain');
        res.send('User-agent: *\nAllow: /');
    });

    app.use('/api', apiNotFound);

    // SPA fallback
    app.get('*', spaFallbackLimiter(), (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'), (err) => {
            if (err) {
                logger.error('Error sending index.html', { message: err.message });
                res.status(500).send('Frontend application is currently unavailable. Please check backend logs.');
            }
        });
    });

    // Last, after every route: turns any unhandled error into a generic response.
    app.use(errorHandler);

    return app;
}
