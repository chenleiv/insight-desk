import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../logger.js';
import { getCurrentUser } from '../auth.js';
import { searchQuerySchema, sendValidationError } from '../schemas.js';
import { search } from '../rag/search.js';

const router = Router();

// Embedding the query is CPU heavy, so search is capped per client IP.
const searchLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { detail: 'Too many searches, please try again in a minute.' },
});

router.get('/api/search', getCurrentUser, searchLimiter, async (req, res) => {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        return sendValidationError(res, parsed.error);
    }

    try {
        const { q, k } = parsed.data;
        res.json({ results: await search(req.user, q, k) });
    } catch (err) {
        logger.error('Search failed', { message: err.message });
        res.status(500).json({ detail: 'Search failed' });
    }
});

export default router;
