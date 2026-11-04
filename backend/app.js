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

    // Request logger. The path only: a query string can hold secrets, such as Google's authorization code.
    app.use((req, res, next) => {
        if (process.env.NODE_ENV !== 'production' || req.path.startsWith('/api')) {
            logger.info(`${req.method} ${req.path}`);
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

    // SPA fallback, for pages only. A missing file, such as an old build's asset after a
    // deploy, gets a real 404: as a page it would be a 200 of the wrong type. Not stored, so
    // no cache keeps the 404 once the file exists.
    app.get('*', spaFallbackLimiter(), (req, res) => {
        if (req.path.startsWith('/assets/') || path.basename(req.path).includes('.')) {
            return res.status(404).set('Cache-Control', 'no-store').type('text/plain').send('Not found');
        }
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
