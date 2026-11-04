import './loadEnv.js';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { logger } from './logger.js';
import { createApp } from './app.js';
import { seedUsersIfEmpty } from './auth.js';
import { loadAIConfig } from './ai.js';
import { repairMissingEmbeddings } from './rag/embedMissing.js';
import { startDemoCleanup } from './demo.js';

const PORT = process.env.PORT || 8000;
const distPath = path.resolve(__dirname, '../dist');

const app = createApp({ distPath });

// MongoDB connection
if (!process.env.MONGODB_URI) {
    logger.error('CRITICAL: MONGODB_URI is not defined in environment variables');
} else {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => {
            logger.info('Connected to MongoDB');
            seedUsersIfEmpty();
            loadAIConfig();
            // Fills in chunks left without an embedding by a failed save; one query when none are.
            void repairMissingEmbeddings();
            // Removes expired demo workspaces on start and every hour, independent of sign-ups.
            startDemoCleanup();
        })
        .catch(err => {
            logger.error('MongoDB connection failed', { message: err.message });
        });
}

const server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT', () => { server.close(() => process.exit(0)); });
