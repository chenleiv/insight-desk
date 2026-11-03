// Which files may be uploaded, shared by the server (which enforces it) and the UI
// (which checks first and builds its file pickers from it), so the two never disagree.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const FILE_TOO_LARGE_MESSAGE =
    `File is too large. The maximum size is ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`;

// Allowed extensions and the MIME types a browser may send for each. The first is
// the one stored and served when the browser sends none.
const UPLOAD_TYPES = {
    pdf: ['application/pdf'],
    docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    xls: ['application/vnd.ms-excel'],
    txt: ['text/plain'],
    md: ['text/markdown', 'text/x-markdown'],
    rtf: ['application/rtf', 'text/rtf'],
};

// What browsers send when they do not know a file's type.
const GENERIC_MIMES = new Set(['', 'application/octet-stream']);

// For a file input's accept attribute, e.g. ".pdf,.docx".
export const UPLOAD_ACCEPT = Object.keys(UPLOAD_TYPES).map((ext) => `.${ext}`).join(',');

function fileExtension(fileName) {
    const match = /\.([^./\\]+)$/.exec(fileName ?? '');
    return match ? match[1].toLowerCase() : '';
}

/**
 * The MIME type to store and serve for a file, or null when it is not allowed.
 * The extension must be allowed, and the MIME type must be one of that extension's,
 * or generic, in which case the extension's own type is used.
 */
export function resolveUploadMime(fileName, mimeType) {
    const ext = fileExtension(fileName);
    if (!Object.hasOwn(UPLOAD_TYPES, ext)) return null;
    const allowed = UPLOAD_TYPES[ext];
    const mime = (mimeType ?? '').toLowerCase();
    if (allowed.includes(mime)) return mime;
    return GENERIC_MIMES.has(mime) ? allowed[0] : null;
}

export function fileTypeNotAllowedMessage(mimeType) {
    return `File type "${mimeType}" is not allowed`;
}

/** The message the server would reject this file with, or null when it is accepted. */
export function uploadError({ name, type, size }) {
    if (size > MAX_UPLOAD_BYTES) return FILE_TOO_LARGE_MESSAGE;
    // A browser that does not know the type sends this one, and the server names it.
    if (!resolveUploadMime(name, type)) return fileTypeNotAllowedMessage(type || 'application/octet-stream');
    return null;
}
