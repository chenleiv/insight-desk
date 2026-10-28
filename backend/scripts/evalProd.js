// Summarize retrieval logs from chat questions in the last N days (default 30, the TTL).
// Usage: npm run eval:prod [-- --days 7]
import '../loadEnv.js';
import mongoose from 'mongoose';
import { getRetrievalSummary, formatSummary } from '../rag/retrievalStats.js';

function parseDays(argv) {
    const i = argv.indexOf('--days');
    if (i === -1) return 30;
    const days = Number(argv[i + 1]);
    if (!Number.isInteger(days) || days < 1) {
        throw new Error('--days must be a positive whole number');
    }
    return days;
}

async function evalProd() {
    const days = parseDays(process.argv.slice(2));
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not defined');
    }
    await mongoose.connect(process.env.MONGODB_URI);

    // Host and database name only, never credentials, so it is clear which database was read.
    console.log(`Database: ${mongoose.connection.host}/${mongoose.connection.name}`);
    const now = new Date();
    console.log(`Retrieval logs from the last ${days} days (until ${now.toISOString()})\n`);
    console.log(formatSummary(await getRetrievalSummary({ days, now })));
}

evalProd()
    .catch((err) => {
        console.error('Production eval failed:', err.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
