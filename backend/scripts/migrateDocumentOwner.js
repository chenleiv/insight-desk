// One-off migration: assign documents without an owner to the oldest admin user.
// Usage: npm run migrate:owner [-- --dry-run]
import '../loadEnv.js';
import mongoose from 'mongoose';
import { Document, User } from '../models.js';

const dryRun = process.argv.includes('--dry-run');

async function migrate() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not defined');
    }
    await mongoose.connect(process.env.MONGODB_URI);

    const admin = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 });
    if (!admin) throw new Error('No admin user found');

    const filter = { ownerId: null };
    const count = dryRun
        ? await Document.countDocuments(filter)
        : (await Document.updateMany(filter, { ownerId: admin._id })).modifiedCount;

    const prefix = dryRun ? '[dry run] would assign' : 'Assigned';
    console.log(`${prefix} ${count} documents to ${admin.email}.`);
}

migrate()
    .catch((err) => {
        console.error('Migration failed:', err.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
