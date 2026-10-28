import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password_hash: { type: String, default: null },
    role: { type: String, enum: ['admin', 'viewer', 'demo'], default: 'viewer' },
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    displayName: { type: String, default: '' },
    jobTitle: { type: String, default: '' },
    // Demo users only: when the demo workspace and its documents are removed.
    expiresAt: { type: Date, default: null, index: true },
}, { timestamps: true });

const attachmentSchema = new mongoose.Schema({
    url: { type: String, required: true },
    fileName: { type: String, required: true },
    fileType: { type: String, required: true },
    extractedText: { type: String, default: '' },
    gridfsId: { type: mongoose.Schema.Types.ObjectId, default: null },
});

const documentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    category: { type: String, required: true },
    content: { type: String, required: true },
    attachments: [attachmentSchema],
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    // Belongs to a demo workspace: visible only to its demo owner, hidden from everyone else.
    demo: { type: Boolean, default: false, index: true },
}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: (doc, ret) => {
            ret.id = ret._id;
            return ret;
        }
    }
});

// A slice of a document's text (content or attachment), produced by the reindex script.
const chunkSchema = new mongoose.Schema({
    docId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    // Copied from the document's ownerId so retrieval can filter per user.
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    index: { type: Number, required: true, min: 0 },
    text: { type: String, required: true },
    // Set by `npm run reindex`; chunks saved by the routes do not have one yet.
    embedding: { type: [Number], default: undefined },
}, { timestamps: true });

chunkSchema.index({ docId: 1, index: 1 }, { unique: true });

// One record per chat question, for measuring retrieval in production.
// Holds IDs and scores only: never the question, chunk text, or the user.
export const RETRIEVAL_LOG_TTL_SECONDS = 30 * 24 * 60 * 60;

const retrievalLogSchema = new mongoose.Schema({
    createdAt: { type: Date, default: Date.now, expires: RETRIEVAL_LOG_TTL_SECONDS },
    // Every chunk the search returned, best first, before the similarity threshold.
    results: [new mongoose.Schema({
        docId: { type: mongoose.Schema.Types.ObjectId, required: true },
        index: { type: Number, required: true },
        score: { type: Number, required: true },
    }, { _id: false, strict: 'throw' })],
    // True when no chunk passed the threshold and the answer was "no information".
    noInfo: { type: Boolean, required: true },
    chunkSize: { type: Number, required: true },
    minSimilarity: { type: Number, required: true },
}, { strict: 'throw', versionKey: false });

const aiConfigSchema = new mongoose.Schema({
    _id: { type: String, default: 'ai' },
    systemPrompt: { type: String, default: '' },
    exampleQuestions: { type: [String], default: [] },
}, { _id: false });

export const User = mongoose.model('User', userSchema);
export const Document = mongoose.model('Document', documentSchema);
export const AIConfig = mongoose.model('AIConfig', aiConfigSchema);
export const Chunk = mongoose.model('Chunk', chunkSchema);
export const RetrievalLog = mongoose.model('RetrievalLog', retrievalLogSchema);
