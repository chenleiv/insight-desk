// Summarize retrieval logs from chat questions (the last 30 days, by TTL).
// Usage: npm run eval:prod
import '../loadEnv.js';
import mongoose from 'mongoose';
import { RetrievalLog } from '../models.js';
import { summarizeRetrievalLogs, formatSummary } from '../rag/retrievalStats.js';

async function evalProd() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not defined');
    }
    await mongoose.connect(process.env.MONGODB_URI);

    const logs = await RetrievalLog.find({}, 'createdAt results.score noInfo').sort({ createdAt: 1 }).lean();
    if (logs.length) {
        console.log(`Retrieval logs from ${logs[0].createdAt.toISOString()} to ${logs.at(-1).createdAt.toISOString()}\n`);
    }
    console.log(formatSummary(summarizeRetrievalLogs(logs)));
}

evalProd()
    .catch((err) => {
        console.error('Production eval failed:', err.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
