import express from 'express';
import { HfInference } from '@huggingface/inference';
import { getCurrentUser, requireAdmin } from './auth.js';
import { aiChatSchema } from './schemas.js';
import { SYSTEM_PROMPT, PROMPT_METADATA } from './prompts.js';

const router = express.Router();

router.post('/api/ai/chat', getCurrentUser, async (req, res) => {
    try {
        const { message, context } = aiChatSchema.parse(req.body);

        if (!process.env.HUGGINGFACE_API_KEY) {
            return res.status(500).json({
                detail: 'HUGGINGFACE_API_KEY is missing in backend .env file. Please add it to enable AI features.'
            });
        }

        const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

        // Build document context block injected into the user message (cleaner than a second system message)
        let contextBlock = '';
        if (context && context.length > 0) {
            const docTexts = context.map((doc, idx) => {
                let text = `[Document ${idx + 1}: ${doc.title}]\n${doc.content}`;
                if (doc.attachments?.length) {
                    const attachedContent = doc.attachments
                        .filter(a => a.extractedText)
                        .map(a => `[Attachment: ${a.fileName}]\n${a.extractedText}`)
                        .join('\n\n');
                    if (attachedContent) text += '\n\n' + attachedContent;
                }
                return text;
            });
            contextBlock = `Context from documents:\n${docTexts.join('\n\n---\n\n')}`;
        }

        const userContent = contextBlock
            ? `${contextBlock}\n\n---\nQuestion: ${message}`
            : message;

        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userContent },
        ];

        const response = await hf.chatCompletion({
            model: 'meta-llama/Meta-Llama-3-8B-Instruct',
            messages,
            max_tokens: 300,
            temperature: 0.3,
        });

        res.json({
            answer: response.choices[0].message.content.trim(),
            sources: context ? context.map(c => ({ id: c.id, title: c.title })) : [],
        });

    } catch (error) {
        if (error.name === 'ZodError') {
            return res.status(400).json({ detail: 'Validation failed', errors: error.errors });
        }
        console.error('HF Inference Error:', error);
        res.status(500).json({
            detail: 'Error communicating with AI service. Please try again later.',
            error: error.message,
        });
    }
});

// Admin-only — exposes the active system prompt for transparency
router.get('/api/ai/prompt', requireAdmin, (req, res) => {
    res.json({ prompt: SYSTEM_PROMPT, ...PROMPT_METADATA });
});

export default router;
