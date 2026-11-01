import express from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from './logger.js';
import Groq from 'groq-sdk';
import { getCurrentUser, requireAdmin } from './auth.js';
import { aiChatSchema, aiFeedbackSchema, qualityQuerySchema, sendValidationError } from './schemas.js';
import { promptState, PROMPT_METADATA, CONTEXT_RULES, NO_INFO_ANSWER, LEGACY_NO_INFO_ANSWERS } from './prompts.js';
import { AIConfig } from './models.js';
import { search } from './rag/search.js';
import { logRetrieval, saveFeedback } from './rag/retrievalLog.js';
import { getRetrievalSummary } from './rag/retrievalStats.js';
import { canViewQuality } from './access.js';

const DEFAULT_SUGGESTIONS = [
    "security issue related to this topic",
    "Summarize the key decisions and their rationale",
    "What are the most common mistakes people make in this area?",
    "What is the most important rules from this topic?",
];

export async function loadAIConfig() {
    try {
        const config = await AIConfig.findById('ai');
        if (config?.systemPrompt) promptState.prompt = config.systemPrompt;
    } catch (e) {
        logger.warn('Could not load AI config from DB, using default', { message: e.message });
    }
}

let _groq = null;
function getGroq() {
    if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return _groq;
}

export const CHAT_MODEL = 'openai/gpt-oss-20b';

// Settings of the answer call, shared with eval/answers.js so it asks exactly as the chat does.
export const CHAT_ANSWER_SETTINGS = { max_tokens: 300, temperature: 0.3 };

/**
 * Turn a question into English search keywords, so a question in another
 * language can match English documents. Returns null on failure.
 */
async function englishKeywords(groq, question) {
    try {
        const response = await groq.chat.completions.create({
            model: CHAT_MODEL,
            messages: [
                { role: 'system', content: 'Translate the question into 3 to 8 English search keywords. Reply with the keywords only, separated by spaces.' },
                { role: 'user', content: question },
            ],
            max_tokens: 200,
            temperature: 0,
            reasoning_effort: 'low',
        });
        return response.choices[0].message.content?.trim() || null;
    } catch (err) {
        logger.warn('Keyword translation failed', { message: err.message });
        return null;
    }
}

export const CONTEXT_CHUNKS = 5;

// Chunks scoring below this are not sent to the model. Calibrated on the demo
// documents (eval/threshold-results.md): unrelated questions top out at 0.287,
// and one related question scores 0.275, so the ranges overlap slightly.
// The model is also told to answer only from context.
export const MIN_SIMILARITY = 0.3;

export { NO_INFO_ANSWER };

export const EMPTY_ANSWER_DETAIL = 'The AI service returned an empty answer. Please try again.';

// A letter outside the Latin script, e.g. Hebrew. The embedding model only understands English.
const NON_LATIN_LETTER = /(?!\p{Script=Latin})\p{L}/u;

/** Break any <chunk> or <context> tag in untrusted text, so it cannot close or open a delimiter. */
function neutralizeTags(text) {
    return text.replace(/<(\/?)(chunk|context)/gi, '&lt;$1$2');
}

/** Wrap each chunk in its own delimiter, with a short id the model can cite. */
function buildContext(chunks) {
    const blocks = chunks.map((c, i) => {
        const title = neutralizeTags(c.title).replace(/"/g, '&quot;');
        return `<chunk id="c${i + 1}" title="${title}">\n${neutralizeTags(c.text)}\n</chunk>`;
    });
    return `<context>\n${blocks.join('\n\n')}\n</context>`;
}

/** The system message: a prompt, then the rules the chat always appends. */
export function systemContent(prompt) {
    return `${prompt}\n\n${CONTEXT_RULES}`;
}

/** The user message: the retrieved chunks, then the question. */
export function userContent(chunks, message) {
    return `${buildContext(chunks)}\n\nQuestion: ${neutralizeTags(message)}`;
}

/**
 * Keep only citations of chunks that were actually retrieved. Ids the model
 * invented are removed from the answer and returned in `unknown`. The model
 * sometimes writes fullwidth brackets, 【c1】; those are rewritten as [c1].
 */
export function verifyCitations(answer, chunks) {
    const byId = new Map(chunks.map((c, i) => [`c${i + 1}`, c]));
    const citations = new Map();
    const unknown = [];
    let text = '';
    let copyFrom = 0;
    // The pattern starts at the bracket: a leading \s* would rescan each run of
    // blanks from every position in it (quadratic on long whitespace).
    for (const match of answer.matchAll(/[[【]\s*(c\d+(?:\s*,\s*c\d+)*)\s*[\]】]/g)) {
        const ids = match[1].split(/\s*,\s*/);
        const valid = ids.filter((id) => byId.has(id));
        unknown.push(...ids.filter((id) => !byId.has(id)));
        for (const id of valid) {
            const c = byId.get(id);
            if (!citations.has(id)) citations.set(id, { id, docId: c.docId, title: c.title, index: c.index });
        }
        const before = answer.slice(copyFrom, match.index);
        // A removed citation takes the whitespace in front of it along with it.
        text += valid.length ? `${before}[${[...new Set(valid)].join(', ')}]` : before.trimEnd();
        copyFrom = match.index + match[0].length;
    }
    text += answer.slice(copyFrom);
    return { answer: text.trim(), citations: [...citations.values()], unknown };
}

// Lowercased, curly apostrophes made straight, citations, surrounding quotes and
// a final period removed, so small variations of the same sentence compare equal.
function normalizeSentence(text) {
    return text
        .replace(/[[【]\s*c\d+(?:\s*,\s*c\d+)*\s*[\]】]/g, '')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^["'\u201c\u201d«]+|["'\u201c\u201d»]+$/g, '')
        .trim()
        .replace(/\.$/, '')
        .toLowerCase();
}

const NO_INFO_SENTENCES = new Set([NO_INFO_ANSWER, ...LEGACY_NO_INFO_ANSWERS].map(normalizeSentence));

/**
 * True when the whole answer is a "not found" sentence, in the current or a
 * legacy wording. A longer answer that only contains one is a real answer.
 */
export function isNoInfoAnswer(answer) {
    return NO_INFO_SENTENCES.has(normalizeSentence(answer));
}

// Each question embeds the query on the CPU and calls Groq, so chat is capped per client IP.
const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { detail: 'Too many questions, please try again in a minute.' },
});

const router = express.Router();

router.post('/api/ai/chat', getCurrentUser, chatLimiter, async (req, res) => {
    try {
        const { message } = aiChatSchema.parse(req.body);

        if (!process.env.GROQ_API_KEY) {
            return res.status(500).json({
                detail: 'GROQ_API_KEY is missing. Please add it to your environment variables.'
            });
        }

        const groq = getGroq();

        // A question in another script is searched with English keywords; the model still gets the original.
        const query = NON_LATIN_LETTER.test(message)
            ? (await englishKeywords(groq, message)) ?? message
            : message;
        // Search only documents this user may read; the user comes from auth, never the request.
        const results = await search(req.user, query, CONTEXT_CHUNKS);
        const chunks = results.filter((c) => c.score >= MIN_SIMILARITY);
        // Logged once the answer is known, so a model refusal also counts as "no information".
        // Null if the log could not be saved; the client then shows no feedback buttons.
        const log = (noInfo) => logRetrieval(req.user, results, { noInfo, minSimilarity: MIN_SIMILARITY });

        // Nothing close enough: answer without calling the model, so it cannot guess.
        if (!chunks.length) {
            return res.json({ answer: NO_INFO_ANSWER, citations: [], answerId: await log(true) });
        }

        const messages = [
            { role: 'system', content: systemContent(promptState.prompt) },
            { role: 'user', content: userContent(chunks, message) },
        ];

        const response = await groq.chat.completions.create({
            model: CHAT_MODEL,
            messages,
            ...CHAT_ANSWER_SETTINGS,
        });

        const choice = response.choices?.[0];
        const { answer, citations, unknown } = verifyCitations(choice?.message?.content ?? '', chunks);
        if (unknown.length) logger.warn('Model cited chunks that were not retrieved', { ids: unknown });

        // A reasoning model can spend all of max_tokens on reasoning and return no text.
        if (!answer) {
            logger.warn('Model returned an empty answer', { finishReason: choice?.finish_reason ?? null });
            return res.status(502).json({ detail: EMPTY_ANSWER_DETAIL });
        }

        res.json({ answer, citations, answerId: await log(isNoInfoAnswer(answer)) });

    } catch (error) {
        if (error.name === 'ZodError') {
            return sendValidationError(res, error);
        }
        logger.error('Inference error', { message: error?.message ?? String(error) });
        res.status(500).json({ detail: 'Error communicating with AI service. Please try again later.' });
    }
});

// Feedback only updates one field of an existing log, and logs are bounded by
// the chat limit, so demo users need no extra cap; this limit stops click floods.
const feedbackLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { detail: 'Too much feedback, please try again in a minute.' },
});

router.post('/api/ai/feedback', getCurrentUser, feedbackLimiter, async (req, res) => {
    const parsed = aiFeedbackSchema.safeParse(req.body);
    if (!parsed.success) {
        return sendValidationError(res, parsed.error);
    }
    try {
        const { answerId, rating } = parsed.data;
        // 404 for another user's answer too, so its existence is not revealed.
        if (!(await saveFeedback(req.user, answerId, rating))) {
            return res.status(404).json({ detail: 'Answer not found' });
        }
        res.json({ answerId, rating });
    } catch (error) {
        logger.error('Feedback error', { message: error?.message ?? String(error) });
        res.status(500).json({ detail: 'Could not save feedback. Please try again later.' });
    }
});

// Anyone can open a demo session, so the quality endpoint is capped per client.
const qualityLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { detail: 'Too many requests, please try again in a minute.' },
});

// Aggregate answer-quality metrics, the same as `npm run eval:prod`, for admins
// and demo visitors. The summary holds counts and scores, never records,
// documents or users.
router.get('/api/ai/quality', getCurrentUser, qualityLimiter, async (req, res) => {
    if (!canViewQuality(req.user)) {
        return res.status(403).json({ detail: 'Not allowed' });
    }
    const parsed = qualityQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        return sendValidationError(res, parsed.error);
    }
    try {
        const { days } = parsed.data;
        res.json({ days, ...(await getRetrievalSummary({ days })) });
    } catch (error) {
        logger.error('Quality summary error', { message: error?.message ?? String(error) });
        res.status(500).json({ detail: 'Could not load quality metrics. Please try again later.' });
    }
});

router.get('/api/ai/prompt', getCurrentUser, (req, res) => {
    res.json({ prompt: promptState.prompt, ...PROMPT_METADATA });
});

router.patch('/api/ai/prompt', requireAdmin, async (req, res) => {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ detail: 'Invalid prompt' });
    }
    try {
        // Saved first, so the running prompt never differs from the stored one.
        const { systemPrompt } = await AIConfig.findByIdAndUpdate('ai', { systemPrompt: prompt.trim() }, { upsert: true, returnDocument: 'after' });
        promptState.prompt = systemPrompt;
        res.json({ prompt: promptState.prompt, ...PROMPT_METADATA });
    } catch (error) {
        logger.error('Prompt save error', { message: error?.message ?? String(error) });
        res.status(500).json({ detail: 'Could not save the prompt. Please try again later.' });
    }
});

router.get('/api/ai/suggestions', getCurrentUser, async (_req, res) => {
    try {
        const config = await AIConfig.findById('ai');
        const questions = config?.exampleQuestions?.length ? config.exampleQuestions : DEFAULT_SUGGESTIONS;
        res.json({ questions });
    } catch {
        res.json({ questions: DEFAULT_SUGGESTIONS });
    }
});

router.patch('/api/ai/suggestions', requireAdmin, async (req, res) => {
    const { questions } = req.body;
    if (!Array.isArray(questions) || questions.some((q) => typeof q !== 'string')) {
        return res.status(400).json({ detail: 'questions must be an array of strings' });
    }
    const filtered = questions.map((q) => q.trim()).filter(Boolean);
    try {
        await AIConfig.findByIdAndUpdate('ai', { exampleQuestions: filtered }, { upsert: true, returnDocument: 'after' });
        res.json({ questions: filtered });
    } catch (error) {
        logger.error('Suggestions save error', { message: error?.message ?? String(error) });
        res.status(500).json({ detail: 'Could not save the questions. Please try again later.' });
    }
});

export default router;
