// Daily limits on the chat's model use. Each limit is one conditional update that checks and
// counts together, as in demoQuota.js, so parallel requests cannot all pass a check and then
// all write. A counter is removed by its TTL, some time after its UTC day has ended.
import { UsageCounter } from './models.js';
import { logger } from './logger.js';

// Below the provider's 200K tokens per day, so visitors cannot reach the last 50K: those are the admin's.
export const DAILY_TOKEN_CEILINGS = { demo: 130_000, viewer: 150_000 };

// Held for a question until its real usage is known: about the most a question uses, with its
// input, the 1024 tokens allowed for the answer and the keyword call for another language.
export const TOKENS_RESERVED_PER_QUESTION = 3_000;

export const DAILY_BUDGET_DETAIL = 'The AI assistant has reached its limit for today. Please come back after the limit resets.';

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

/** The day counters belong to. A UTC day, so every server instance agrees on it. */
export function utcDay(now = new Date()) {
    return now.toISOString().slice(0, 10);
}

export const tokensKey = (now = new Date()) => `tokens:${utcDay(now)}`;

/** Whole seconds until the daily counters start over. */
export function secondsUntilReset(now = new Date()) {
    const nextDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    return Math.max(1, Math.ceil((nextDay - now.getTime()) / 1000));
}

const refusal = (status, detail, scope) => {
    logger.warn('Chat usage limit reached', { scope });
    return { status, detail, retryAfter: secondsUntilReset() };
};

/**
 * What one question has used so far. settle() must run once the question is over: it replaces
 * the reservation with the tokens the provider reported, and it never throws.
 */
function questionBudget(key, reserved) {
    let spent = 0;
    // A call may have used tokens that were never reported, such as one that timed out.
    let unreported = false;
    return {
        /** Run a model call and count what the provider reports for it. */
        async track(call) {
            try {
                const response = await call();
                const tokens = response?.usage?.total_tokens;
                if (Number.isFinite(tokens)) spent += tokens;
                else unreported = true;
                return response;
            } catch (err) {
                // An error with a status is the provider's refusal, which uses no tokens.
                if (err?.status === undefined) unreported = true;
                throw err;
            }
        },
        async settle() {
            const used = unreported ? Math.max(spent, TOKENS_RESERVED_PER_QUESTION) : spent;
            logger.info('Chat question tokens', { tokens: used, reported: !unreported });
            try {
                await adjustUnits(key, used - reserved);
            } catch (err) {
                logger.warn('Could not settle chat usage', { message: err.message });
            }
        },
    };
}

/**
 * Take what a question may use, before any model call. Returns { budget }, or { refused } with
 * the status, message and Retry-After to answer with.
 */
export async function reserveQuestion(user) {
    // The admin is never refused and holds no reservation, so the chat needs no counter to work.
    // The tokens still count, after the response, so visitors stop that much sooner.
    if (user.role === 'admin') return { budget: questionBudget(tokensKey(), 0) };

    // Any other role gets the lowest ceiling.
    const ceiling = DAILY_TOKEN_CEILINGS[user.role] ?? DAILY_TOKEN_CEILINGS.demo;
    const key = tokensKey();
    if (!(await takeUnits(key, TOKENS_RESERVED_PER_QUESTION, ceiling))) {
        return { refused: refusal(503, DAILY_BUDGET_DETAIL, 'tokens') };
    }
    return { budget: questionBudget(key, TOKENS_RESERVED_PER_QUESTION) };
}
