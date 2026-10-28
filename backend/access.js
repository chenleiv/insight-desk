// Who may see and change which documents.
// Demo users work in a private sandbox of documents they own. Everyone else
// shares the regular (non-demo) documents, which only admins may change.

export function isDemoUser(user) {
    return user?.role === 'demo';
}

// Anyone can open a demo workspace, and every saved chunk is embedded on the
// CPU, so demo writes are bounded. Keep in sync with src/auth/demoLimits.ts.
export const DEMO_LIMITS = {
    documents: 20,
    contentLength: 20000,
    attachmentsPerDocument: 1,
};

export function canEditDocuments(user) {
    return user?.role === 'admin' || isDemoUser(user);
}

// Admins and demo visitors may read the aggregate quality metrics. They hold
// counts and scores only, so a demo visitor learns nothing about other users.
export function canViewQuality(user) {
    return user?.role === 'admin' || isDemoUser(user);
}

// Mongo filter for the documents a user may see.
export function documentScope(user) {
    return isDemoUser(user) ? { ownerId: user._id } : { demo: { $ne: true } };
}

export function canAccessDocument(user, doc) {
    if (!doc) return false;
    return isDemoUser(user) ? String(doc.ownerId) === String(user._id) : !doc.demo;
}
