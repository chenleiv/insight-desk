import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password_hash: { type: String, default: null },
    role: { type: String, enum: ['admin', 'viewer'], default: 'viewer' },
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    displayName: { type: String, default: '' },
    jobTitle: { type: String, default: '' },
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

const aiConfigSchema = new mongoose.Schema({
    _id: { type: String, default: 'ai' },
    systemPrompt: { type: String, default: '' },
    exampleQuestions: { type: [String], default: [] },
}, { _id: false });

export const User = mongoose.model('User', userSchema);
export const Document = mongoose.model('Document', documentSchema);
export const AIConfig = mongoose.model('AIConfig', aiConfigSchema);
