import { Router } from 'express';
import { logger } from '../logger.js';
import { User } from '../models.js';
import { requireAdmin } from '../auth.js';

const router = Router();

// List all users (admin)
router.get('/', requireAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password_hash').sort({ createdAt: 1 });
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
    try {
        const { role, status } = req.body;
        const update = {};
        if (role && ['admin', 'viewer'].includes(role)) update.role = role;
        if (status && ['active', 'inactive'].includes(status)) update.status = status;

        if (Object.keys(update).length === 0) {
            return res.status(400).json({ detail: 'No valid fields to update' });
        }

        const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password_hash');
        if (!user) return res.status(404).json({ detail: 'User not found' });

        res.json({ id: user._id, email: user.email, role: user.role, status: user.status || 'active' });
    } catch (err) {
        logger.error('Error updating user', { message: err.message });
        res.status(500).json({ detail: 'Error updating user' });
    }
});

// Delete user (admin)
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        if (req.user._id.toString() === req.params.id) {
            return res.status(400).json({ detail: 'Cannot delete your own account' });
        }
        const deleted = await User.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ detail: 'User not found' });
        res.status(204).send();
    } catch (err) {
        logger.error('Error deleting user', { message: err.message });
        res.status(500).json({ detail: 'Error deleting user' });
    }
});

export default router;
