import express from 'express';
import { HfInference } from '@huggingface/inference';
import { getCurrentUser } from './auth.js';
import { aiChatSchema } from './schemas.js';

const router = express.Router();

// Initialize HF client with API token from env

router.post('/api/ai/chat', getCurrentUser, async (req, res) => {
    try {
        const { message, context } = aiChatSchema.parse(req.body);

        // Check if API key is missing
        if (!process.env.HUGGINGFACE_API_KEY) {
            return res.status(500).json({
                detail: 'HUGGINGFACE_API_KEY is missing in backend .env file. Please add it to enable AI features.'
            });
        }

        // Initialize client here where process.env is guaranteed to be populated
        const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

        // Construct messages array for chatCompletion
        const messages = [
            { role: 'system', content: 'You are a helpful Knowledge Workspace assistant. Please keep your answers concise and to the point, ideally under 50 words unless the user asks for a detailed explanation.' }
        ];

        if (context && context.length > 0) {
            let contextText = 'Use the following relevant documents to help answer the user\'s question:\n';
            context.forEach((doc, idx) => {
                let docText = `${idx + 1}. [${doc.title}] ${doc.content}`;
                if (doc.attachments?.length) {
                    const attachedContent = doc.attachments
                        .filter(a => a.extractedText)
                        .map(a => `[Attachment: ${a.fileName}] ${a.extractedText}`)
                        .join('\n');
                    if (attachedContent) docText += '\n' + attachedContent;
                }
                contextText += docText + '\n';
            });
            messages.push({ role: 'system', content: contextText });
        }

        messages.push({ role: 'user', content: message });

        // Llama-3 should work now that the API Key is correctly loaded!
        const response = await hf.chatCompletion({
            model: 'meta-llama/Meta-Llama-3-8B-Instruct',
            messages: messages,
            max_tokens: 150,
            temperature: 0.7,
        });

        res.json({
            answer: response.choices[0].message.content.trim(),
            sources: context ? context.map(c => ({ id: c.id, title: c.title })) : []
        });

    } catch (error) {
        if (error.name === 'ZodError') {
            return res.status(400).json({ detail: 'Validation failed', errors: error.errors });
        }
        console.error('HF Inference Error:', error);
        res.status(500).json({
            detail: 'Error communicating with AI service. Please try again later.',
            error: error.message
        });
    }
});

export default router;
