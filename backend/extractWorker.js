// Child process that parses one uploaded file: the bytes arrive on stdin, one JSON
// line leaves on stdout. If a hostile file exhausts its memory, only this process dies.
import { Worker } from 'worker_threads';
import { parseFile } from './textParsers.js';
import { UnsafeFileError } from './zipGuard.js';

// Runs on its own thread, so it still fires while a parser blocks the main thread. It
// watches total memory, which the V8 heap limit misses (Buffers live outside the heap),
// and the time, so this process ends even if the server that started it has died.
const WATCHDOG = `
const { workerData: { maxRssBytes, maxMs } } = require('worker_threads');
const start = Date.now();
setInterval(() => {
  if (process.memoryUsage.rss() > maxRssBytes || Date.now() - start > maxMs) process.kill(process.pid, 'SIGKILL');
}, 25);`;

const [mimeType, maxRssBytes, maxMs] = process.argv.slice(2);
new Worker(WATCHDOG, { eval: true, workerData: { maxRssBytes: Number(maxRssBytes), maxMs: Number(maxMs) } }).unref();

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

let result;
try {
    result = { text: await parseFile(Buffer.concat(chunks), mimeType) };
} catch (err) {
    result = err instanceof UnsafeFileError ? { rejected: err.message } : { text: '', failed: err.message };
}
process.stdout.write(JSON.stringify(result), () => process.exit(0));
