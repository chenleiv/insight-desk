// Daily limits on the chat's model use. Each limit is one conditional update that checks and
// counts together, as in demoQuota.js, so parallel requests cannot all pass a check and then
// all write. A counter is removed by its TTL, some time after its UTC day has ended.
import { UsageCounter } from './models.js';
import { keyedHash } from './auth.js';
import { addressKey } from './clientAddress.js';
import { logger } from './logger.js';

// Below the provider's 200K tokens per day, so visitors cannot reach the last 50K: those are the admin's.
export const DAILY_TOKEN_CEILINGS = { demo: 130_000, viewer: 150_000 };

// Held for a question until its real usage is known: about the most a question uses, with its
// input, the 1024 tokens allowed for the answer and the keyword call for another language.
export const TOKENS_RESERVED_PER_QUESTION = 3_000;

// Questions per day for each account or demo sandbox.
export const DAILY_QUESTION_LIMITS = { demo: 15, viewer: 50 };

// Demo questions per day from one address. A visitor can open 10 sandboxes an hour, so the
// limit per sandbox alone does not bound one address.
export const DEMO_ADDRESS_QUESTION_LIMIT = 30;

export const DEMO_QUESTION_LIMIT_DETAIL = `This demo has reached its limit of ${DAILY_QUESTION_LIMITS.demo} questions for today. Please come back after the limit resets.`;
export const VIEWER_QUESTION_LIMIT_DETAIL = `You have reached your limit of ${DAILY_QUESTION_LIMITS.viewer} questions for today. Please come back after the limit resets.`;
export const DEMO_ADDRESS_LIMIT_DETAIL = 'Too many demo questions have come from this network today. Please come back after the limit resets.';
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
export const userQuestionsKey = (user, now = new Date()) => `questions:user:${user._id}:${utcDay(now)}`;
// Keyed, so the database never holds a visitor's address.
export const addressQuestionsKey = (address, now = new Date()) => `questions:address:${keyedHash(String(addressKey(address)))}:${utcDay(now)}`;

/** Whole seconds until the daily counters start over. */
export function secondsUntilReset(now = new Date()) {
    const nextDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    return Math.max(1, Math.ceil((nextDay - now.getTime()) / 1000));
}

const refusal = (status, detail, scope) => {
    logger.warn('Chat usage limit reached', { scope });
    return { status, detail, retryAfter: secondsUntilReset() };
};

const giveBack = (keys) => Promise.all(keys.map((key) => adjustUnits(key, -1)));

/**
 * What one question has used so far. settle() must run once the question is over: it replaces
 * the reservation with the tokens the provider reported, and it never throws.
 */
function questionBudget(key, reserved, questionKeys = []) {
    let spent = 0;
    let failed = false;
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
        /** The question got no answer, so it does not count against the question limits. */
        fail() {
            failed = true;
        },
        async settle() {
            const used = unreported ? Math.max(spent, TOKENS_RESERVED_PER_QUESTION) : spent;
            logger.info('Chat question tokens', { tokens: used, reported: !unreported });
            try {
                await adjustUnits(key, used - reserved);
                if (failed) await giveBack(questionKeys);
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
export async function reserveQuestion(user, address) {
    // The admin is never refused and holds no reservation, so the chat needs no counter to work.
    // The tokens still count, after the response, so visitors stop that much sooner.
    if (user.role === 'admin') return { budget: questionBudget(tokensKey(), 0) };

    // Any other role gets the demo's limits, the lowest.
    const isViewer = user.role === 'viewer';
    const questionLimits = isViewer
        ? [{ key: userQuestionsKey(user), max: DAILY_QUESTION_LIMITS.viewer, status: 429, detail: VIEWER_QUESTION_LIMIT_DETAIL, scope: 'viewer' }]
        : [
            { key: userQuestionsKey(user), max: DAILY_QUESTION_LIMITS.demo, status: 429, detail: DEMO_QUESTION_LIMIT_DETAIL, scope: 'sandbox' },
            { key: addressQuestionsKey(address), max: DEMO_ADDRESS_QUESTION_LIMIT, status: 429, detail: DEMO_ADDRESS_LIMIT_DETAIL, scope: 'address' },
        ];
    const tokens = tokensKey();
    const ceiling = isViewer ? DAILY_TOKEN_CEILINGS.viewer : DAILY_TOKEN_CEILINGS.demo;

    const taken = [];
    try {
        for (const { key, max, status, detail, scope } of questionLimits) {
            if (!(await takeUnits(key, 1, max))) {
                await giveBack(taken);
                return { refused: refusal(status, detail, scope) };
            }
            taken.push(key);
        }
        if (!(await takeUnits(tokens, TOKENS_RESERVED_PER_QUESTION, ceiling))) {
            await giveBack(taken);
            return { refused: refusal(503, DAILY_BUDGET_DETAIL, 'tokens') };
        }
    } catch (err) {
        await giveBack(taken).catch(() => {});
        throw err;
    }
    return { budget: questionBudget(tokens, TOKENS_RESERVED_PER_QUESTION, taken) };
}
