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
    // Demo users only: documents in the workspace, kept by the atomic updates in demoQuota.js.
    demoDocuments: { type: Number },
    demoStorageBytes: { type: Number },
    // Demo users only: the least recently active workspace is removed when too many are live.
    lastActiveAt: { type: Date },
}, { timestamps: true });

userSchema.index({ role: 1, lastActiveAt: 1 });

const attachmentSchema = new mongoose.Schema({
    url: { type: String, required: true },
    fileName: { type: String, required: true },
    fileType: { type: String, required: true },
    fileSize: { type: Number },
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
    // Vector of the chunk's title and text, set when the chunk is saved. Missing only
    // when embedding failed on save; a retry fills it in, and search skips it until then.
    embedding: { type: [Number], default: undefined },
    // embeddingKey(title, text) of the input `embedding` was computed from; set with it.
    embeddingKey: { type: String },
}, { timestamps: true });

chunkSchema.index({ docId: 1, index: 1 }, { unique: true });

// One record per chat question, for measuring retrieval in production.
// Holds IDs and scores only: never the question, chunk text, or the user.
const RETRIEVAL_LOG_TTL_SECONDS = 30 * 24 * 60 * 60;

const retrievalLogSchema = new mongoose.Schema({
    createdAt: { type: Date, default: Date.now, expires: RETRIEVAL_LOG_TTL_SECONDS },
    // Every chunk the search returned, best first, before the similarity threshold.
    results: [new mongoose.Schema({
        docId: { type: mongoose.Schema.Types.ObjectId, required: true },
        index: { type: Number, required: true },
        score: { type: Number, required: true },
    }, { _id: false, strict: 'throw' })],
    // True when the answer was "no information": no chunk passed the threshold,
    // or the model replied with the "not found" sentence.
    noInfo: { type: Boolean, required: true },
    chunkSize: { type: Number, required: true },
    // EMBEDDING_FORMAT_VERSION in the code, always set on save. Records saved
    // before this field existed have none; the TTL removes them within 30 days.
    embeddingFormat: { type: Number },
    minSimilarity: { type: Number, required: true },
    // HMAC of the asking user and this record's id, so only that user can rate
    // the answer. It cannot be traced back to a user without the server secret.
    ownerTag: { type: String, required: true, select: false },
    // The user's rating of the answer, if any. A new rating replaces the old one.
    feedback: { type: String, enum: ['up', 'down', null], default: null },
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
