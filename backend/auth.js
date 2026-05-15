import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from './models.js';

import { loginSchema, registerSchema } from './schemas.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-change-me') {
    console.error('CRITICAL: JWT_SECRET is not set or is using the default value. This is a severe security risk.');
    if (process.env.NODE_ENV === 'production') {
        console.error('ACTION REQUIRED: Set a unique JWT_SECRET in your production environment variables (e.g., in Render dashboard).');
        throw new Error('JWT_SECRET must be set in production for security.');
    }
}

const ACCESS_TOKEN_MINUTES = parseInt(process.env.ACCESS_TOKEN_MINUTES || '60');
const ENV = process.env.ENV || 'dev';
const COOKIE_NAME = 'access_token';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
// In production this is the same as the app URL. In dev set FRONTEND_URL=http://localhost:5173
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:8000';
const FRONTEND_URL = process.env.FRONTEND_URL || APP_BASE_URL;

// Seed initial users if none exist
export async function seedUsersIfEmpty() {
    const count = await User.countDocuments();
    if (count === 0) {
        console.log('Seeding initial users...');
        const adminHash = await bcrypt.hash('admin123', 10);
        const viewerHash = await bcrypt.hash('viewer123', 10);

        await User.create([
            { email: 'admin@demo.com', password_hash: adminHash, role: 'admin' },
            { email: 'viewer@demo.com', password_hash: viewerHash, role: 'viewer' }
        ]);
        console.log('Users seeded successfully');
    }
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

function setAuthCookie(res, token) {
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: ENV === 'prod' || process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: ACCESS_TOKEN_MINUTES * 60 * 1000,
    });
}

router.post('/login', async (req, res) => {
    try {
        const { email, password } = loginSchema.parse(req.body);

        const user = await User.findOne({ email });
        if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ detail: 'Invalid credentials' });
        }

        const token = createAccessToken(user.email, user.role);
        setAuthCookie(res, token);
        res.json({ user: { email: user.email, role: user.role, favorites: user.favorites || [], displayName: user.displayName || '', jobTitle: user.jobTitle || '' } });
    } catch (err) {
        if (err.name === 'ZodError') {
            return res.status(400).json({ detail: 'Validation failed', errors: err.errors });
        }
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
        res.status(201).json({ user: { email: user.email, role: user.role, favorites: [], displayName: user.displayName || '', jobTitle: '' } });
    } catch (err) {
        if (err.name === 'ZodError') {
            return res.status(400).json({ detail: 'Validation failed', errors: err.errors });
        }
        res.status(500).json({ detail: 'Internal server error' });
    }
});

// --- Google OAuth (redirect flow) ---
// Requires env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_BASE_URL
router.get('/google', (req, res) => {
    if (!GOOGLE_CLIENT_ID) {
        return res.status(503).json({ detail: 'Google OAuth is not configured' });
    }
    const params = new URLSearchParams({
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
    const { code, error } = req.query;

    if (error || !code) {
        return res.redirect(`${FRONTEND_URL}/login?error=google_cancelled`);
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
            console.error('Google token exchange failed:', tokens);
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

        const token = createAccessToken(user.email, user.role);
        setAuthCookie(res, token);
        res.redirect(`${FRONTEND_URL}/hub`);
    } catch (err) {
        console.error('Google OAuth callback error:', err);
        res.redirect(`${FRONTEND_URL}/login?error=google_server_error`);
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
});

router.patch('/password', getCurrentUser, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ detail: 'currentPassword and newPassword are required' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ detail: 'New password must be at least 6 characters' });
        }

        const user = req.user;
        if (user.password_hash && !(await bcrypt.compare(currentPassword, user.password_hash))) {
            return res.status(401).json({ detail: 'Current password is incorrect' });
        }

        user.password_hash = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.json({ ok: true });
    } catch (err) {
        console.error('Change password failed:', err);
        res.status(500).json({ detail: 'Internal server error' });
    }
});

router.get('/me', getCurrentUser, (req, res) => {
    res.json({
        email: req.user.email,
        role: req.user.role,
        favorites: req.user.favorites || [],
        displayName: req.user.displayName || '',
        jobTitle: req.user.jobTitle || '',
    });
});

router.patch('/profile', getCurrentUser, async (req, res) => {
    try {
        const { displayName, jobTitle } = req.body;
        const update = {};
        if (typeof displayName === 'string') update.displayName = displayName.trim().slice(0, 80);
        if (typeof jobTitle === 'string') update.jobTitle = jobTitle.trim().slice(0, 80);

        const user = await User.findByIdAndUpdate(req.user._id, update, { new: true });
        res.json({
            email: user.email,
            role: user.role,
            favorites: user.favorites || [],
            displayName: user.displayName || '',
            jobTitle: user.jobTitle || '',
        });
    } catch (err) {
        console.error('Update profile failed:', err);
        res.status(500).json({ detail: 'Internal server error' });
    }
});

export default router;
