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

function isProduction() {
    return process.env.ENV === 'prod' || process.env.NODE_ENV === 'production';
}

// scheme://host:port as a browser sends it in Origin: lowercase host, no default
// port, no trailing slash. Null for anything that is not an http(s) origin.
export function normalizeOrigin(value) {
    try {
        const { origin } = new URL(value);
        return origin === 'null' ? null : origin;
    } catch {
        return null;
    }
}

// Where the frontend runs: the public URL from FRONTEND_URL or APP_BASE_URL
// (Render sets only FRONTEND_URL), plus the Vite dev servers.
export function allowedOrigins() {
    return [
        'http://localhost:5173',
        'http://localhost:5174',
        process.env.FRONTEND_URL,
        process.env.APP_BASE_URL,
    ].map(normalizeOrigin).filter(Boolean);
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originHost(origin) {
    try {
        return new URL(origin).host || 'none';
    } catch {
        return origin === 'null' ? 'null' : 'invalid';
    }
}

// CSRF defense in depth. SameSite=Lax already keeps the auth cookie off
// cross-site POSTs; this also refuses cross-site requests that need no cookie
// (starting a demo, logging out) and covers same-site neighbours and old
// browsers. Browsers send Origin on every non-GET request, so a request without
// one is not from a web page. Origin "null" (sandboxed frames, file pages) is refused.
export function rejectCrossSiteRequests(allowed) {
    return (req, res, next) => {
        const origin = req.get('Origin');
        if (SAFE_METHODS.has(req.method) || origin === undefined || allowed.includes(normalizeOrigin(origin))) {
            return next();
        }
        logger.warn('Blocked cross-site request', {
            originHost: originHost(origin),
            route: `${req.method} ${req.baseUrl}${req.path}`,
        });
        res.status(403).json({ detail: 'Cross-site request blocked' });
    };
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
    if (isProduction() && !process.env.FRONTEND_URL && !process.env.APP_BASE_URL) {
        logger.error('FRONTEND_URL and APP_BASE_URL are both unset: every state-changing API request '
            + 'will be refused as cross-site. Set FRONTEND_URL to the public URL.');
    }

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
        allowedHeaders: ['Content-Type', 'Authorization'],
        // Lets a cross-origin frontend read the server's file name on a document download.
        exposedHeaders: ['Content-Disposition'],
    }));

    app.use('/api', rejectCrossSiteRequests(allowOrigins));

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
