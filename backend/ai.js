import express from 'express';
import { logger } from './logger.js';
import Groq from 'groq-sdk';
import { getCurrentUser, requireAdmin } from './auth.js';
import { aiChatSchema } from './schemas.js';
import { promptState, PROMPT_METADATA, DEFAULT_PROMPT } from './prompts.js';
import { AIConfig } from './models.js';
import { retrieveChunks } from './rag/retrieveChunks.js';

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

const router = express.Router();

router.post('/api/ai/chat', getCurrentUser, async (req, res) => {
    try {
        const { message, docIds } = aiChatSchema.parse(req.body);

        if (!process.env.GROQ_API_KEY) {
            return res.status(500).json({
                detail: 'GROQ_API_KEY is missing. Please add it to your environment variables.'
            });
        }

        const groq = getGroq();

        // Search only documents this user may read; the user comes from auth, never the request.
        const chunks = await retrieveChunks(req.user, message, docIds);
        const contextBlock = chunks.length
            ? `Context from documents:\n${chunks.map((c) => `[From: ${c.title}]\n${c.text}`).join('\n\n---\n\n')}`
            : '';

        const userContent = contextBlock
            ? `${contextBlock}\n\n---\nQuestion: ${message}`
            : message;

        const messages = [
            { role: 'system', content: promptState.prompt },
            { role: 'user', content: userContent },
        ];

        const response = await groq.chat.completions.create({
            model: 'openai/gpt-oss-20b',
            messages,
            max_tokens: 300,
            temperature: 0.3,
        });

        res.json({
            answer: response.choices[0].message.content.trim(),
            // One source per document, in order of its best chunk.
            sources: [...new Map(chunks.map((c) => [c.docId, { id: c.docId, title: c.title }])).values()],
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
