import express from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from './logger.js';
import Groq from 'groq-sdk';
import { getCurrentUser, requireAdmin } from './auth.js';
import { aiChatSchema, aiFeedbackSchema } from './schemas.js';
import { promptState, PROMPT_METADATA, DEFAULT_PROMPT, CONTEXT_RULES } from './prompts.js';
import { AIConfig } from './models.js';
import { search } from './rag/search.js';
import { logRetrieval, saveFeedback } from './rag/retrievalLog.js';

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

const CHAT_MODEL = 'openai/gpt-oss-20b';

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

const CONTEXT_CHUNKS = 5;

// Chunks scoring below this are not sent to the model. Calibrated on the demo
// documents: unrelated questions topped out at 0.27, related ones started at 0.34.
// Kept at the low end, since the model is also told to answer only from context.
const MIN_SIMILARITY = 0.3;

export const NO_INFO_ANSWER = "I don't have information about this in your documents.";

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

/**
 * Keep only citations of chunks that were actually retrieved. Ids the model
 * invented are removed from the answer and returned in `unknown`. The model
 * sometimes writes fullwidth brackets, 【c1】; those are rewritten as [c1].
 */
function verifyCitations(answer, chunks) {
    const byId = new Map(chunks.map((c, i) => [`c${i + 1}`, c]));
    const citations = new Map();
    const unknown = [];
    const text = answer.replace(/(\s*)[[【]\s*(c\d+(?:\s*,\s*c\d+)*)\s*[\]】]/g, (_, space, list) => {
        const ids = list.split(/\s*,\s*/);
        const valid = ids.filter((id) => byId.has(id));
        unknown.push(...ids.filter((id) => !byId.has(id)));
        for (const id of valid) {
            const c = byId.get(id);
            if (!citations.has(id)) citations.set(id, { id, docId: c.docId, title: c.title, index: c.index });
        }
        return valid.length ? `${space}[${[...new Set(valid)].join(', ')}]` : '';
    });
    return { answer: text.trim(), citations: [...citations.values()], unknown };
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
        // Null if the log could not be saved; the client then shows no feedback buttons.
        const answerId = await logRetrieval(req.user, results, { noInfo: !chunks.length, minSimilarity: MIN_SIMILARITY });

        // Nothing close enough: answer without calling the model, so it cannot guess.
        if (!chunks.length) {
            return res.json({ answer: NO_INFO_ANSWER, citations: [], sources: [], answerId });
        }

        const userContent = `${buildContext(chunks)}\n\nQuestion: ${neutralizeTags(message)}`;

        const messages = [
            { role: 'system', content: `${promptState.prompt}\n\n${CONTEXT_RULES}` },
            { role: 'user', content: userContent },
        ];

        const response = await groq.chat.completions.create({
            model: CHAT_MODEL,
            messages,
            max_tokens: 300,
            temperature: 0.3,
        });

        const { answer, citations, unknown } = verifyCitations(response.choices[0].message.content, chunks);
        if (unknown.length) logger.warn('Model cited chunks that were not retrieved', { ids: unknown });

        res.json({
            answer,
            citations,
            // One source per document, in order of its best chunk.
            sources: [...new Map(chunks.map((c) => [c.docId, { id: c.docId, title: c.title }])).values()],
            answerId,
        });

    } catch (error) {
        if (error.name === 'ZodError') {
            return res.status(400).json({ detail: 'Validation failed', errors: error.errors });
        }
        logger.error('Inference error', { message: error?.message ?? String(error) });
        res.status(500).json({
            detail: 'Error communicating with AI service. Please try again later.',
            error: error.message,
        });
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
        return res.status(400).json({ detail: 'Validation failed', errors: parsed.error.errors });
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

router.get('/api/ai/prompt', getCurrentUser, (req, res) => {
    res.json({ prompt: promptState.prompt, ...PROMPT_METADATA });
});

router.patch('/api/ai/prompt', requireAdmin, async (req, res) => {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ detail: 'Invalid prompt' });
    }
    promptState.prompt = prompt.trim();
    await AIConfig.findByIdAndUpdate('ai', { systemPrompt: promptState.prompt }, { upsert: true, new: true });
    res.json({ prompt: promptState.prompt, ...PROMPT_METADATA });
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
    await AIConfig.findByIdAndUpdate('ai', { exampleQuestions: filtered }, { upsert: true, new: true });
    res.json({ questions: filtered });
});

export default router;
