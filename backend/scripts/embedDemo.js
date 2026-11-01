// Precompute an embedding vector for every chunk of the demo sample documents
// and save them to backend/demo/sample-embeddings.json, so demo workspaces get
// vectors without loading the model in the server.
// Run it again whenever sample-documents.json, the chunking, the embedding
// format or the model changes.
// Usage: npm run embed:demo
import { readFileSync, writeFileSync } from 'fs';
import { buildDocumentChunks, CHUNK_SIZE, CHUNK_OVERLAP } from '../rag/buildChunks.js';
import { embeddingKey, embeddingText, EMBEDDING_FORMAT_VERSION } from '../rag/embeddingInput.js';
import {
    embed,
    EMBEDDING_MODEL,
    EMBEDDING_MODEL_REVISION,
    EMBEDDING_DIMENSIONS,
} from '../rag/embed.js';

// Six decimals keep the file about half the size; the change in similarity
// scores is far below anything that affects ranking.
const DECIMALS = 6;

const samplesUrl = new URL('../demo/sample-documents.json', import.meta.url);
const outputUrl = new URL('../demo/sample-embeddings.json', import.meta.url);

async function embedDemo() {
    const samples = JSON.parse(readFileSync(samplesUrl, 'utf8'));
    const chunks = samples.flatMap((doc) => buildDocumentChunks(doc).map((c) => ({ title: doc.title, text: c.text })));

    const vectors = {};
    for (const { title, text } of chunks) {
        const key = embeddingKey(title, text);
        if (vectors[key]) continue;
        const vector = await embed(embeddingText(title, text));
        vectors[key] = vector.map((x) => Number(x.toFixed(DECIMALS)));
    }

    const header = {
        model: EMBEDDING_MODEL,
        revision: EMBEDDING_MODEL_REVISION,
        dimensions: EMBEDDING_DIMENSIONS,
        chunkSize: CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP,
        embeddingFormat: EMBEDDING_FORMAT_VERSION,
    };
    // One vector per line, so a diff shows which chunks changed.
    const lines = Object.entries(vectors).map(([key, v]) => `    ${JSON.stringify(key)}: ${JSON.stringify(v)}`);
    const headerLines = Object.entries(header).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
    writeFileSync(outputUrl, `{\n${headerLines.join('\n')}\n  "vectors": {\n${lines.join(',\n')}\n  }\n}\n`);

    console.log(`Saved ${Object.keys(vectors).length} vectors for ${samples.length} sample documents.`);
}

embedDemo().catch((err) => {
    console.error('Embedding demo documents failed:', err.message);
    process.exitCode = 1;
});
