import express from 'express';
import { logger } from './logger.js';
import Groq from 'groq-sdk';
import { getCurrentUser, requireAdmin } from './auth.js';
import { aiChatSchema } from './schemas.js';
import { promptState, PROMPT_METADATA, DEFAULT_PROMPT } from './prompts.js';
import { Document, AIConfig } from './models.js';
import { extractTextFromUrl } from './textExtract.js';

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
        const { message, context } = aiChatSchema.parse(req.body);

        if (!process.env.GROQ_API_KEY) {
            return res.status(500).json({
                detail: 'GROQ_API_KEY is missing. Please add it to your environment variables.'
            });
        }

        const groq = getGroq();

        // Enrich each context doc with attachment extractedText from MongoDB,
        // lazily back-filling any attachments that were uploaded before this feature.
        const enrichedContext = await Promise.all((context || []).map(async (ctxDoc) => {
            if (!ctxDoc.id) return ctxDoc;
            try {
                const dbDoc = await Document.findById(ctxDoc.id).lean();
                if (!dbDoc) return ctxDoc;

                const enrichedAttachments = await Promise.all(
                    (dbDoc.attachments || []).map(async (att) => {
                        if (att.extractedText) return att;
                        const text = await extractTextFromUrl(att.url, att.fileType);
                        if (text) {
                            Document.updateOne(
                                { _id: dbDoc._id, 'attachments._id': att._id },
                                { $set: { 'attachments.$.extractedText': text } }
                            ).catch(() => {});
                        }
                        return { ...att, extractedText: text };
                    })
                );
                return { ...ctxDoc, attachments: enrichedAttachments };
            } catch {
                return ctxDoc;
            }
        }));

        // Build document context block injected into the user message
        let contextBlock = '';
        if (enrichedContext.length > 0) {
            const docTexts = enrichedContext.map((doc, idx) => {
                let block = `[Document ${idx + 1}: ${doc.title}]\n${doc.content}`;
                const attachParts = (doc.attachments || [])
                    .filter(a => a.extractedText)
                    .map(a => `[File: ${a.fileName}]\n${a.extractedText}`)
                    .join('\n\n');
                if (attachParts) block += `\n\n${attachParts}`;
                return block;
            });
            contextBlock = `Context from documents:\n${docTexts.join('\n\n---\n\n')}`;
        }

        const userContent = contextBlock
            ? `${contextBlock}\n\n---\nQuestion: ${message}`
            : message;

        const messages = [
            { role: 'system', content: promptState.prompt },
            { role: 'user', content: userContent },
        ];

        const response = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages,
            max_tokens: 300,
            temperature: 0.3,
        });

        res.json({
            answer: response.choices[0].message.content.trim(),
            sources: enrichedContext.map(c => ({ id: c.id, title: c.title })),
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
