import { logger } from '../logger.js';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

export function applyMiddleware(app) {
    app.use(compression());

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

    // CORS must run BEFORE rate limiter so error responses (429) include CORS headers
    const allowOrigins = [
        'http://localhost:5173',
        'http://localhost:5174',
        process.env.FRONTEND_URL
    ].filter(Boolean);

    app.use(cors({
        origin: (origin, callback) => {
            if (!origin || allowOrigins.includes(origin)) {
                callback(null, true);
            } else {
                logger.warn('CORS: request from unauthorized origin', { origin });
                callback(null, true);
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    }));

    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: process.env.NODE_ENV === 'production' ? 100 : 1000,
        standardHeaders: true,
        legacyHeaders: false,
        message: { detail: 'Too many requests, please try again later.' }
    });
    app.use('/api/', limiter);
}
