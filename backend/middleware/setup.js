import { isIP } from 'node:net';
import { logger } from '../logger.js';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { isDevOrTest } from '../runtimeEnv.js';

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

// TEMPORARY: the diagnostic below is removed once TRUST_PROXY_HOPS is verified in production.
const MAX_LOGGED_FORWARDED_ENTRIES = 10;

// Keeps the network part only: two IPv4 octets or at most three IPv6 groups. Groups
// after "::" are never kept, as they can be the end of the address. Clients choose what
// they send in X-Forwarded-For, so anything that is not an address is not logged at all.
export function maskAddress(value) {
    const address = value.trim().replace(/^::ffff:(?=\d+\.)/i, '');
    const version = isIP(address);
    if (version === 4) return `${address.split('.').slice(0, 2).join('.')}.x.x`;
    if (version === 6) {
        const head = address.split('::')[0].split(':').slice(0, 3).join(':');
        return head ? `${head}:x` : '::x';
    }
    return 'invalid';
}

// With TRUST_PROXY_DIAGNOSTIC=true, logs how a GET /health?ipcheck request reached the
// server, so TRUST_PROXY_HOPS can be compared with the real proxy chain. Logged as a
// warning so a quieter LOG_LEVEL does not hide it. The no-store does not depend on the
// switch: the response is the same with it on or off, and every check reaches the server.
function trustProxyDiagnostic(trustProxyHops) {
    const enabled = process.env.TRUST_PROXY_DIAGNOSTIC === 'true';
    if (enabled) {
        logger.warn('TRUST_PROXY_DIAGNOSTIC is on: remove it once the check is done.');
    }
    return (req, res, next) => {
        if (req.method === 'GET' && req.path === '/health' && Object.hasOwn(req.query, 'ipcheck')) {
            res.set('Cache-Control', 'no-store');
            if (enabled) {
                const entries = (req.get('X-Forwarded-For') ?? '')
                    .split(',').map((entry) => entry.trim()).filter(Boolean);
                logger.warn('client-ip-check', {
                    trustProxyHops,
                    entryCount: entries.length,
                    clientIp: maskAddress(req.ip ?? ''),
                    // The rightmost entries, as the proxies append theirs and a client can only add to the left.
                    forwardedFor: entries.slice(-MAX_LOGGED_FORWARDED_ENTRIES).map(maskAddress),
                });
            }
        }
        next();
    };
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
// (Render sets only FRONTEND_URL), plus the Vite dev servers in development and tests.
export function allowedOrigins() {
    return [
        ...(isDevOrTest() ? ['http://localhost:5173', 'http://localhost:5174'] : []),
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
function rejectCrossSiteRequests(allowed) {
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
    const trustProxyHops = parseTrustProxyHops(process.env.TRUST_PROXY_HOPS);
    app.set('trust proxy', trustProxyHops);
    // A warning, not a refusal: every visitor shares one address, but nothing can be spoofed.
    if (!isDevOrTest() && trustProxyHops === 0) {
        logger.warn('TRUST_PROXY_HOPS is unset, zero or invalid: behind a proxy, all visitors '
            + 'share one address in every per-address limit.');
    }
    app.use(trustProxyDiagnostic(trustProxyHops));

    app.use(compression());

    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                // No 'unsafe-inline': an injected <script> or onclick= handler will not run.
                "script-src": ["'self'"],
                // The frontend calls only its own API and shows no external images.
                "connect-src": ["'self'"],
                "img-src": ["'self'", "data:"],
                // The fonts are self-hosted, so no stylesheet or font comes from another host.
                "style-src": ["'self'", "'unsafe-inline'"],
                "font-src": ["'self'"],
            },
        },
    }));

    // CORS must run BEFORE rate limiter so error responses (429) include CORS headers
    const allowOrigins = allowedOrigins();
    if (!isDevOrTest() && !process.env.FRONTEND_URL && !process.env.APP_BASE_URL) {
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
        max: isDevOrTest() ? 1000 : 100,
        standardHeaders: true,
        legacyHeaders: false,
        message: { detail: 'Too many requests, please try again later.' }
    });
    app.use('/api/', limiter);
}

// The SPA fallback only sends index.html, on full page loads and refreshes; static
// assets are served before it and in-app navigation never reaches the server.
// 1000 per 15 minutes leaves room for an office of visitors behind one NAT
// address while stopping a client that requests pages in a loop.
export const SPA_FALLBACK_LIMIT = 1000;

// Relies on the trust proxy setting from applyMiddleware for the client IP.
export function spaFallbackLimiter() {
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        max: SPA_FALLBACK_LIMIT,
        standardHeaders: true,
        legacyHeaders: false,
        message: 'Too many requests, please try again later.',
    });
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
