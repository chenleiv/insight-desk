import { logger } from '../logger.js';
import { JSON_BODY_LIMIT } from './setup.js';

const GENERIC_DETAIL = {
    413: `Request body is too large. The maximum size is ${JSON_BODY_LIMIT}.`,
    500: 'Internal server error',
};

// Mounted last: catches errors thrown by routes or passed to next(err).
// The details stay in the server log; the client gets only a generic message,
// so stack traces, queries, and internal messages never leave the server.
// Express treats it as an error handler only because it takes four parameters.
export function errorHandler(err, req, res, next) {
    // Client errors raised by middleware, such as malformed JSON, keep their 4xx status.
    const status = err.status >= 400 && err.status < 500 ? err.status : 500;

    logger.error('Request failed', {
        method: req.method,
        path: req.path,
        status,
        message: err.message,
        stack: err.stack,
    });

    if (res.headersSent) return;
    res.status(status).json({ detail: GENERIC_DETAIL[status] ?? 'Bad request' });
}
