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
