// Child process that parses one uploaded file: the bytes arrive on stdin, one JSON
// line leaves on stdout. If a hostile file exhausts its memory, only this process dies.
import { Worker } from 'worker_threads';
import { parseFile } from './textParsers.js';
import { UnsafeFileError } from './zipGuard.js';

// Runs on its own thread, so it still fires while a parser blocks the main thread. It
// watches total memory, which the V8 heap limit misses (Buffers live outside the heap),
// and the time, so this process ends even if the server that started it has died.
const WATCHDOG = `
const { writeSync } = require('fs');
const { workerData: { maxRssBytes, maxMs } } = require('worker_threads');
const start = Date.now();
// Tells the server why on a separate pipe: a fixed word and a number, nothing from the file.
function stop(reason, rss) {
  try { writeSync(3, JSON.stringify({ reason, rssMB: Math.round(rss / 1048576) })); } catch {}
  process.kill(process.pid, 'SIGKILL');
}
setInterval(() => {
  const rss = process.memoryUsage.rss();
  if (rss > maxRssBytes) stop('memory', rss);
  else if (Date.now() - start > maxMs) stop('time', rss);
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
