import express from 'express';
import { logger } from './logger.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import rateLimit from 'express-rate-limit';
import { User } from './models.js';
import { canEditDocuments, isDemoUser } from './access.js';
import { createDemoWorkspace, removeDemoWorkspace } from './demo.js';

import { loginSchema, registerSchema, sendValidationError } from './schemas.js';

const router = express.Router();

// Stricter than the global /api limit: slows down password guessing.
// Only failed attempts count, so a user who logs in successfully is not penalized.
// Per client IP, which needs TRUST_PROXY_HOPS set behind a proxy.
const passwordAttemptLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { detail: 'Too many failed attempts, please try again in 15 minutes.' },
});

// Each demo workspace copies the sample documents, so creation is capped per IP.
const demoCreationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { detail: 'Too many demo sessions from this network, please try again later.' },
});

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-change-me') {
    logger.error('CRITICAL: JWT_SECRET is not set or is insecure');
    if (process.env.NODE_ENV === 'production') {
        logger.error('Set a unique JWT_SECRET in production environment variables');
        throw new Error('JWT_SECRET must be set in production for security.');
    }
}

const ACCESS_TOKEN_MINUTES = parseInt(process.env.ACCESS_TOKEN_MINUTES || '60');
const ENV = process.env.ENV || 'dev';
const COOKIE_NAME = 'access_token';

function formatUser(user) {
    return {
        email: user.email,
        role: user.role,
        favorites: user.favorites || [],
        displayName: user.displayName || '',
        jobTitle: user.jobTitle || '',
        ...(isDemoUser(user) && { expiresAt: user.expiresAt }),
    };
}

function handleZodError(err, res) {
    if (err.name === 'ZodError') {
        sendValidationError(res, err);
        return true;
    }
    return false;
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
// In production this is the same as the app URL. In dev set FRONTEND_URL=http://localhost:5173
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8000';
const FRONTEND_URL = process.env.FRONTEND_URL || APP_BASE_URL;

// Seed the first admin into an empty database. There are no hard-coded accounts
// in any environment: the admin comes from ADMIN_EMAIL / ADMIN_PASSWORD, or is not created at all.
export async function seedUsersIfEmpty() {
    const count = await User.countDocuments();
    if (count > 0) return;

    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) {
        logger.error('No users and ADMIN_EMAIL / ADMIN_PASSWORD not set; no admin created');
        return;
    }
    await User.create({ email, password_hash: await bcrypt.hash(password, 10), role: 'admin' });
    logger.info('Seeded initial admin from environment');
}

/** Keyed hash of a value with the server secret: cannot be reversed or recomputed without it. */
export function keyedHash(value) {
    return createHmac('sha256', JWT_SECRET).update(value).digest('hex');
}

function createAccessToken(email, role) {
    return jwt.sign({ sub: email, role }, JWT_SECRET, { expiresIn: `${ACCESS_TOKEN_MINUTES}m` });
}

export async function getCurrentUser(req, res, next) {
    const token = req.cookies[COOKIE_NAME];
    if (!token) {
        return res.status(401).json({ detail: 'Not authenticated' });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        const user = await User.findOne({ email: payload.sub });
        if (!user) {
            return res.status(401).json({ detail: 'User not found' });
        }
        if (isDemoUser(user) && user.expiresAt && user.expiresAt < new Date()) {
            return res.status(401).json({ detail: 'Demo session expired' });
        }
        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ detail: 'Invalid token' });
    }
}

export function requireAdmin(req, res, next) {
    getCurrentUser(req, res, () => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ detail: 'Admin only' });
        }
        next();
    });
}

// Admins edit the shared documents; demo users edit their own sandbox.
export function requireEditor(req, res, next) {
    getCurrentUser(req, res, () => {
        if (!canEditDocuments(req.user)) {
            return res.status(403).json({ detail: 'Not allowed' });
        }
        next();
    });
}

function setAuthCookie(res, token) {
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: ENV === 'prod' || process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: ACCESS_TOKEN_MINUTES * 60 * 1000,
    });
}

router.post('/login', passwordAttemptLimiter, async (req, res) => {
    try {
        const { email, password } = loginSchema.parse(req.body);

        const user = await User.findOne({ email });
        if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ detail: 'Invalid credentials' });
        }
        // Checked after the password, so the account status is revealed only to its owner.
        if (user.status === 'inactive') {
            return res.status(403).json({ detail: 'This account is not active' });
        }

        const token = createAccessToken(user.email, user.role);
        setAuthCookie(res, token);
        res.json({ user: formatUser(user) });
    } catch (err) {
        if (handleZodError(err, res)) return;
        res.status(500).json({ detail: 'Internal server error' });
    }
});

router.post('/register', async (req, res) => {
    try {
        const { email, password, displayName } = registerSchema.parse(req.body);

        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(409).json({ detail: 'An account with this email already exists' });
        }

        const hash = await bcrypt.hash(password, 10);
        const user = await User.create({ email, password_hash: hash, role: 'viewer', displayName: displayName?.trim() || '' });

        const token = createAccessToken(user.email, user.role);
        setAuthCookie(res, token);
        res.status(201).json({ user: formatUser(user) });
    } catch (err) {
        if (handleZodError(err, res)) return;
        res.status(500).json({ detail: 'Internal server error' });
    }
});

// --- Google OAuth (redirect flow) ---
// Requires env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_BASE_URL

// The state ties the callback to the browser that started the login (login CSRF).
// Lax lets the cookie ride the top-level redirect back from Google.
const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: ENV === 'prod' || process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/google',
};

function isValidOAuthState(returned, expected) {
    if (typeof returned !== 'string' || typeof expected !== 'string') return false;
    const a = Buffer.from(returned);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

router.get('/google', (req, res) => {
    if (!GOOGLE_CLIENT_ID) {
        return res.status(503).json({ detail: 'Google OAuth is not configured' });
    }
    const state = randomBytes(32).toString('base64url');
    res.cookie(OAUTH_STATE_COOKIE, state, { ...OAUTH_STATE_COOKIE_OPTIONS, maxAge: 10 * 60 * 1000 });
    const params = new URLSearchParams({
        state,
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: `${APP_BASE_URL}/api/auth/google/callback`,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'select_account',
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req, res) => {
    const { code, error, state } = req.query;
    const expectedState = req.cookies?.[OAUTH_STATE_COOKIE];
    // One use only: the state is cleared whatever the outcome.
    res.clearCookie(OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE_OPTIONS);

    if (error || !code) {
        return res.redirect(`${FRONTEND_URL}/login?error=google_cancelled`);
    }
    if (!isValidOAuthState(state, expectedState)) {
        return res.redirect(`${FRONTEND_URL}/login?error=google_state_mismatch`);
    }
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return res.redirect(`${FRONTEND_URL}/login?error=google_not_configured`);
    }

    try {
        // Exchange authorization code for tokens
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: `${APP_BASE_URL}/api/auth/google/callback`,
                grant_type: 'authorization_code',
            }),
        });
        const tokens = await tokenRes.json();

        if (!tokens.access_token) {
            logger.error('Google token exchange failed', tokens);
            return res.redirect(`${FRONTEND_URL}/login?error=google_token_failed`);
        }

        // Get the user's Google profile
        const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const profile = await profileRes.json();

        if (!profile.email) {
            return res.redirect(`${FRONTEND_URL}/login?error=google_no_email`);
        }

        // Find existing user or create a new one (viewer role by default)
        let user = await User.findOne({ email: profile.email });
        if (!user) {
            user = await User.create({ email: profile.email, role: 'viewer' });
        }
        if (user.status === 'inactive') {
            return res.redirect(`${FRONTEND_URL}/login?error=account_inactive`);
        }

        const token = createAccessToken(user.email, user.role);
        setAuthCookie(res, token);
        res.redirect(`${FRONTEND_URL}/hub`);
    } catch (err) {
        logger.error('Google OAuth callback error', { message: err.message });
        res.redirect(`${FRONTEND_URL}/login?error=google_server_error`);
    }
});

// Start a private demo workspace and sign in as its temporary user.
router.post('/demo', demoCreationLimiter, async (req, res) => {
    try {
        const user = await createDemoWorkspace();
        setAuthCookie(res, createAccessToken(user.email, user.role));
        res.status(201).json({ user: formatUser(user) });
    } catch (err) {
        logger.error('Demo workspace creation failed', { message: err.message });
        res.status(500).json({ detail: 'Could not start the demo' });
    }
});

// A demo user has no password, so once the cookie is gone the workspace can never
// be reached again: remove it now instead of keeping it until expiry.
async function removeDemoWorkspaceOnLogout(token) {
    let email;
    try {
        email = jwt.verify(token, JWT_SECRET).sub;
    } catch {
        return;
    }
    const user = await User.findOne({ email });
    if (!isDemoUser(user)) return;
    await removeDemoWorkspace(user._id);
    logger.info('Removed demo workspace on logout');
}

// Always succeeds and clears the cookie; if removing a demo workspace fails,
// the scheduled cleanup removes it at expiry.
router.post('/logout', async (req, res) => {
    const token = req.cookies[COOKIE_NAME];
    if (token) {
        try {
            await removeDemoWorkspaceOnLogout(token);
        } catch (err) {
            logger.error('Demo removal on logout failed', { message: err.message });
        }
    }
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
});

router.patch('/password', passwordAttemptLimiter, getCurrentUser, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ detail: 'currentPassword and newPassword are required' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ detail: 'New password must be at least 6 characters' });
        }

        const user = req.user;
        if (isDemoUser(user)) {
            return res.status(403).json({ detail: 'Not available in the demo' });
        }
        if (user.password_hash && !(await bcrypt.compare(currentPassword, user.password_hash))) {
            return res.status(401).json({ detail: 'Current password is incorrect' });
        }

        user.password_hash = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.json({ ok: true });
    } catch (err) {
        logger.error('Change password failed', { message: err.message });
        res.status(500).json({ detail: 'Internal server error' });
    }
});

router.get('/me', getCurrentUser, (req, res) => {
    res.json(formatUser(req.user));
});

router.patch('/profile', getCurrentUser, async (req, res) => {
    try {
        const { displayName, jobTitle } = req.body;
        const update = {};
        if (typeof displayName === 'string') update.displayName = displayName.trim().slice(0, 80);
        if (typeof jobTitle === 'string') update.jobTitle = jobTitle.trim().slice(0, 80);

        const user = await User.findByIdAndUpdate(req.user._id, update, { new: true });
        res.json(formatUser(user));
    } catch (err) {
        logger.error('Update profile failed', { message: err.message });
        res.status(500).json({ detail: 'Internal server error' });
    }
});

export default router;
