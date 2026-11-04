// Demo limits are enforced by one conditional update that checks and counts together,
// so parallel requests cannot all pass a check and then all write. A counter missing
// from a workspace created before it existed reads as zero, which $not:$gte allows.
import { User } from './models.js';
import { DEMO_LIMITS } from './access.js';

/** Take a document slot in the user's workspace. False when the workspace is full. */
export async function reserveDemoDocument(user) {
    const { modifiedCount } = await User.updateOne(
        { _id: user._id, demoDocuments: { $not: { $gte: DEMO_LIMITS.documents } } },
        { $inc: { demoDocuments: 1 } },
    );
    return modifiedCount === 1;
}

/** Give a document slot back. */
export async function releaseDemoDocument(user) {
    await User.updateOne({ _id: user._id }, { $inc: { demoDocuments: -1 } });
}

// What a stored chunk costs per character of text: its 384-number vector makes it about
// 5.6 KB for each 480 new characters, so a small text file can cost far more than its size.
const STORAGE_BYTES_PER_CHAR = 12;

/** What an attachment counts for against the workspace's storage quota. */
export function demoStorageCost(fileSize, extractedText) {
    return (fileSize ?? 0) + (extractedText?.length ?? 0) * STORAGE_BYTES_PER_CHAR;
}

/** Reserve storage in the user's workspace. False when it would go over the quota. */
export async function reserveDemoStorage(user, bytes) {
    if (bytes > DEMO_LIMITS.storageBytes) return false;
    const { modifiedCount } = await User.updateOne(
        { _id: user._id, demoStorageBytes: { $not: { $gt: DEMO_LIMITS.storageBytes - bytes } } },
        { $inc: { demoStorageBytes: bytes } },
    );
    return modifiedCount === 1;
}

/** Give reserved storage back. */
export async function releaseDemoStorage(user, bytes) {
    if (bytes) await User.updateOne({ _id: user._id }, { $inc: { demoStorageBytes: -bytes } });
}
