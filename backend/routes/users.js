import { Router } from 'express';
import { logger } from '../logger.js';
import { User } from '../models.js';
import { getCurrentUser, requireAdmin } from '../auth.js';
import { isDemoUser } from '../access.js';
import { DEMO_SAMPLE_USERS } from '../demo.js';
import { userIdParamSchema, userUpdateSchema, sendValidationError } from '../schemas.js';

const router = Router();

// ObjectId strings are lowercase, but the id parameter accepts either case.
function isOwnAccount(req, id) {
    return req.user._id.toString() === id.toLowerCase();
}

// List all users (admin). Demo users get a fictional list for the read-only screen.
router.get('/', getCurrentUser, async (req, res) => {
    if (isDemoUser(req.user)) return res.json(DEMO_SAMPLE_USERS);
    if (req.user.role !== 'admin') return res.status(403).json({ detail: 'Admin only' });
    try {
        // Temporary demo users are not real accounts to manage.
        const users = await User.find({ role: { $ne: 'demo' } }).select('-password_hash').sort({ createdAt: 1 });
        res.json(users.map(u => ({
            id: u._id,
            email: u.email,
            role: u.role,
            status: u.status || 'active',
            createdAt: u.createdAt,
            displayName: u.displayName || '',
            jobTitle: u.jobTitle || '',
        })));
    } catch (err) {
        logger.error('Error fetching users', { message: err.message });
        res.status(500).json({ detail: 'Error fetching users' });
    }
});

// Update user role/status (admin)
router.patch('/:id', requireAdmin, async (req, res) => {
    const params = userIdParamSchema.safeParse(req.params);
    if (!params.success) return sendValidationError(res, params.error);
    // Keeps an admin from locking themselves out, so an active admin always remains.
    if (isOwnAccount(req, params.data.id)) {
        return res.status(400).json({ detail: 'Cannot change your own role or status' });
    }
    const body = userUpdateSchema.safeParse(req.body);
    if (!body.success) return sendValidationError(res, body.error);

    const { role, status } = body.data;
    const update = {};
    if (role !== undefined) update.role = role;
    if (status !== undefined) update.status = status;
    // Otherwise re-enabling the account would bring its unexpired sessions back.
    if (status === 'inactive') update.$inc = { tokenVersion: 1 };

    try {
        const user = await User.findByIdAndUpdate(params.data.id, update, { new: true }).select('-password_hash');
        if (!user) return res.status(404).json({ detail: 'User not found' });

        res.json({ id: user._id, email: user.email, role: user.role, status: user.status || 'active' });
    } catch (err) {
        logger.error('Error updating user', { message: err.message });
        res.status(500).json({ detail: 'Error updating user' });
    }
});

// Delete user (admin)
router.delete('/:id', requireAdmin, async (req, res) => {
    const params = userIdParamSchema.safeParse(req.params);
    if (!params.success) return sendValidationError(res, params.error);

    try {
        if (isOwnAccount(req, params.data.id)) {
            return res.status(400).json({ detail: 'Cannot delete your own account' });
        }
        const deleted = await User.findByIdAndDelete(params.data.id);
        if (!deleted) return res.status(404).json({ detail: 'User not found' });
        res.status(204).send();
    } catch (err) {
        logger.error('Error deleting user', { message: err.message });
        res.status(500).json({ detail: 'Error deleting user' });
    }
});

export default router;
