import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from './models.js';

import { loginSchema } from './schemas.js';

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

router.post('/login', async (req, res) => {
    try {
        const { email, password } = loginSchema.parse(req.body);

        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ detail: 'Invalid credentials' });
        }

        const token = createAccessToken(user.email, user.role);

        res.cookie(COOKIE_NAME, token, {
            httpOnly: true,
            secure: ENV === 'prod' || process.env.NODE_ENV === 'production',
            sameSite: 'lax', // Use lax for better compatibility while maintaining security
            path: '/',
            maxAge: ACCESS_TOKEN_MINUTES * 60 * 1000
        });

        res.json({ user: { email: user.email, role: user.role } });
    } catch (err) {
        if (err.name === 'ZodError') {
            return res.status(400).json({ detail: 'Validation failed', errors: err.errors });
        }
        res.status(500).json({ detail: 'Internal server error' });
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
});

router.get('/me', getCurrentUser, (req, res) => {
    res.json({
        email: req.user.email,
        role: req.user.role,
        favorites: req.user.favorites || []
    });
});

export default router;
