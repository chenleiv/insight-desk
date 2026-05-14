import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password_hash: { type: String, default: null },
    role: { type: String, enum: ['admin', 'viewer'], default: 'viewer' },
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],
}, { timestamps: true });

const attachmentSchema = new mongoose.Schema({
    url: { type: String, required: true },
    fileName: { type: String, required: true },
    fileType: { type: String, required: true },
    extractedText: { type: String, default: '' },
});

const documentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    category: { type: String, required: true },
    summary: { type: String, required: true },
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

export const User = mongoose.model('User', userSchema);
export const Document = mongoose.model('Document', documentSchema);
