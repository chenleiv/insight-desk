import express from 'express';

const router = express.Router();

router.get('/health', (req, res) => {
    res.json({ ok: true });
});

// TEMPORARY: shows how the server sees the caller's address, to measure the
// proxy chain in production and pick TRUST_PROXY_HOPS. Returns only the
// caller's own request data. Remove once the value is set.
router.get('/api/debug/client-ip', (req, res) => {
    res.json({
        ip: req.ip,
        ips: req.ips,
        trustProxy: req.app.get('trust proxy'),
        socketAddress: req.socket.remoteAddress,
        xForwardedFor: req.get('x-forwarded-for') ?? null,
        cfConnectingIp: req.get('cf-connecting-ip') ?? null,
        trueClientIp: req.get('true-client-ip') ?? null,
        xRealIp: req.get('x-real-ip') ?? null,
    });
});

export default router;
