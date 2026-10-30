import { logger } from '../logger.js';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Number of reverse proxies in front of the server. On Render it is 3:
// Cloudflare, Render's load balancer, and Render's local proxy.
// Express then takes the client IP from X-Forwarded-For, skipping only that
// many trusted hops, so a client cannot spoof its IP to dodge the rate limit.
// Unset, zero, or invalid means no proxy is trusted.
export function parseTrustProxyHops(value) {
    if (value === undefined || value === '') return 0;
    const hops = Number(value);
    if (!Number.isInteger(hops) || hops < 0) {
        logger.warn('Ignoring invalid TRUST_PROXY_HOPS', { value });
        return 0;
    }
    return hops;
}

// The frontend runs on its own origin (a separate static site), so the auth cookie
// must be sent on cross-site requests: SameSite=None instead of Lax.
// Off by default, which keeps the single-service deploy (API serves the SPA) unchanged.
export function isCrossSiteAuth() {
    return process.env.AUTH_COOKIE_CROSS_SITE === 'true';
}

export function allowedOrigins() {
    return [
        'http://localhost:5173',
        'http://localhost:5174',
        process.env.FRONTEND_URL,
    ].filter(Boolean);
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// With a SameSite=None cookie, any site can make the browser send it on a form POST
// (CORS only hides the response). Browsers always send Origin on cross-site POSTs,
// so a state-changing request from an origin that is not allowed is refused.
// Requests without Origin (curl, server-to-server) carry no browser cookie risk.
export function rejectForeignOrigin(req, res, next) {
    const origin = req.get('Origin');
    if (SAFE_METHODS.has(req.method) || !origin || allowedOrigins().includes(origin)) {
        return next();
    }
    logger.warn('Blocked state-changing request from unauthorized origin', { origin, method: req.method });
    res.status(403).json({ detail: 'Origin not allowed' });
}

export function applyMiddleware(app) {
    app.set('trust proxy', parseTrustProxyHops(process.env.TRUST_PROXY_HOPS));

    app.use(compression());

    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                // No 'unsafe-inline': an injected <script> or onclick= handler will not run.
                "script-src": ["'self'"],
                "connect-src": ["'self'", "https://*"],
                "img-src": ["'self'", "data:", "https://*"],
            },
        },
    }));

    // CORS must run BEFORE rate limiter so error responses (429) include CORS headers
    const allowOrigins = allowedOrigins();

    app.use(cors({
        origin: (origin, callback) => {
            if (!origin || allowOrigins.includes(origin)) {
                callback(null, true);
            } else {
                logger.warn('CORS: request from unauthorized origin', { origin });
                callback(null, false);
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    }));

    if (isCrossSiteAuth()) {
        app.use(rejectForeignOrigin);
    }

    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: process.env.NODE_ENV === 'production' ? 100 : 1000,
        standardHeaders: true,
        legacyHeaders: false,
        message: { detail: 'Too many requests, please try again later.' }
    });
    app.use('/api/', limiter);
}

// The largest JSON body the server parses. A bigger one is rejected with 413
// before any route reads it, so a client cannot make the server buffer huge payloads.
export const JSON_BODY_LIMIT = '2mb';

export function jsonBody() {
    return express.json({ limit: JSON_BODY_LIMIT });
}

// Mounted after all API routers: an unknown /api path is a client error, not a
// page, so it must not fall through to the SPA's index.html with status 200.
export function apiNotFound(req, res) {
    res.status(404).json({ detail: 'Not found' });
}
