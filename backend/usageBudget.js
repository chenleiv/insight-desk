// Daily limits on the chat's model use. Each limit is one conditional update that checks and
// counts together, as in demoQuota.js, so parallel requests cannot all pass a check and then
// all write. A counter is removed by its TTL, some time after its UTC day has ended.
import { UsageCounter } from './models.js';

const COUNTER_TTL_MS = 2 * 24 * 60 * 60 * 1000;

const counterExpiry = () => new Date(Date.now() + COUNTER_TTL_MS);

/** Add `amount` unless the counter would go over `max`. False when it would. */
export async function takeUnits(key, amount, max) {
    const update = { $inc: { count: amount } };
    const fits = { _id: key, count: { $lte: max - amount } };
    try {
        await UsageCounter.updateOne(fits, { ...update, $setOnInsert: { expiresAt: counterExpiry() } }, { upsert: true });
        return true;
    } catch (err) {
        if (err.code !== 11000) throw err;
    }
    // The counter exists: it is over the limit, or a parallel request has just created it.
    const { modifiedCount } = await UsageCounter.updateOne(fits, update);
    return modifiedCount === 1;
}

/** Add to a counter, or take back with a negative `amount`. Not subject to any limit. */
export async function adjustUnits(key, amount) {
    if (!amount) return;
    await UsageCounter.updateOne(
        { _id: key },
        { $inc: { count: amount }, $setOnInsert: { expiresAt: counterExpiry() } },
        { upsert: true },
    );
}
