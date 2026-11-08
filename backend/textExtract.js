import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

export { rtfToText } from './textParsers.js';

const WORKER_PATH = fileURLToPath(new URL('./extractWorker.js', import.meta.url));

// Sized for a 512 MB server. An idle worker with the parsers loaded takes about 120 MB.
export const EXTRACTION_LIMITS = {
    timeMs: 20 * 1000,
    heapMB: 160,
    totalMB: 256,
};
// V8's young generation. Its default size lets the worker's peak memory reach totalMB on
// an ordinary large document, so a valid file was refused at random.
const SEMI_SPACE_MB = 8;
// Files waiting behind the one being parsed. Each waits up to timeMs per file ahead of
// it, so the wait stays under the proxy's 100-second timeout.
export const MAX_WAITING_EXTRACTIONS = 3;
const BUSY_RETRY_AFTER_SECONDS = 30;
// The worker's backstop: it ends itself a little after the server should have killed it.
const WORKER_BACKSTOP_MS = 5000;
// 50,000 characters, each up to six bytes once escaped as JSON, plus the wrapper.
const MAX_OUTPUT_BYTES = 400 * 1000;
// The watchdog's report on the extra pipe. A hostile worker could write anything there.
const MAX_WORKER_REPORT_CHARS = 100;
const WORKER_REPORT_REASONS = new Set(['memory', 'time']);

/** An upload the server refuses to parse. The message is safe to show the user. */
export class ExtractionError extends Error {
    constructor(message, status, retryAfter) {
        super(message);
        this.isExtractionError = true;
        this.status = status;
        this.retryAfter = retryAfter;
    }
}

const COULD_NOT_PROCESS = 'This file could not be processed. It may be too large or too complex.';

function parseWorkerReport(raw) {
    if (raw.length > MAX_WORKER_REPORT_CHARS) return null;
    try {
        const { reason, rssMB } = JSON.parse(raw);
        return WORKER_REPORT_REASONS.has(reason) && Number.isInteger(rssMB) ? { reason, rssMB } : null;
    } catch {
        return null;
    }
}

function runWorker(buffer, mimeType, limits) {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const child = spawn(process.execPath, [
            `--max-old-space-size=${limits.heapMB}`,
            `--max-semi-space-size=${SEMI_SPACE_MB}`,
            WORKER_PATH,
            mimeType,
            String(limits.totalMB * 1024 * 1024),
            String(limits.timeMs + WORKER_BACKSTOP_MS),
        ], {
            // A hostile file must not reach the server's secrets, so the worker gets none.
            env: {},
            stdio: ['pipe', 'pipe', 'ignore', 'pipe'],
        });

        const output = [];
        let outputBytes = 0;
        let workerReport = '';
        let killedFor = null;
        const timer = setTimeout(() => {
            killedFor ??= 'time';
            child.kill('SIGKILL');
        }, limits.timeMs);

        child.stdout.on('data', (chunk) => {
            outputBytes += chunk.length;
            if (outputBytes > MAX_OUTPUT_BYTES) {
                killedFor ??= 'output';
                child.kill('SIGKILL');
            } else output.push(chunk);
        });
        child.stdio[3].on('data', (chunk) => {
            if (workerReport.length <= MAX_WORKER_REPORT_CHARS) workerReport += chunk;
        });
        child.stdio[3].on('error', () => {});
        // The worker may die before reading all its input; its exit reports the outcome.
        child.stdin.on('error', () => {});
        child.stdin.end(buffer);

        child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        child.on('close', (code, signal) => {
            clearTimeout(timer);
            if (code !== 0) {
                const report = parseWorkerReport(workerReport);
                logger.warn('Extraction worker stopped', {
                    code,
                    signal,
                    reason: killedFor ?? report?.reason ?? (signal === 'SIGABRT' ? 'heap' : 'unknown'),
                    rssMB: report?.rssMB ?? null,
                    elapsedMs: Date.now() - startedAt,
                    inputBytes: buffer.length,
                    mimeType,
                });
                reject(new ExtractionError(COULD_NOT_PROCESS, 422));
                return;
            }
            let result;
            try {
                result = JSON.parse(Buffer.concat(output).toString('utf8'));
            } catch (err) {
                reject(err);
                return;
            }
            if (result.rejected) {
                logger.warn('Extraction refused a file', { reason: result.rejected });
                reject(new ExtractionError(result.rejected, 422));
                return;
            }
            if (result.failed) logger.error('Text extraction failed', { message: result.failed });
            resolve(result.text);
        });
    });
}

let running = false;
const waiting = [];

function startNext() {
    const next = waiting.shift();
    if (!next) {
        running = false;
        return;
    }
    running = true;
    next();
}

/**
 * The text of an uploaded file, parsed in a child process with memory and time limits,
 * one file at a time. Returns '' for a file that is damaged. Rejects with an
 * ExtractionError when the file breaks a limit (422) or too many are waiting (503).
 */
export function extractTextFromBuffer(buffer, mimeType, limits = EXTRACTION_LIMITS) {
    if (running && waiting.length >= MAX_WAITING_EXTRACTIONS) {
        return Promise.reject(new ExtractionError(
            'The server is busy processing other files. Please try again shortly.',
            503,
            BUSY_RETRY_AFTER_SECONDS,
        ));
    }
    return new Promise((resolve, reject) => {
        waiting.push(() => runWorker(buffer, mimeType, limits).then(resolve, reject).finally(startNext));
        if (!running) startNext();
    });
}
