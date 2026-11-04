// Checks that a file's first bytes match its type. The extension and the MIME type
// are both chosen by the client, so neither says what the file really is.

const ZIP = Buffer.from('504b0304', 'hex');
const OLE = Buffer.from('d0cf11e0a1b11ae1', 'hex');
const PDF = Buffer.from('%PDF-');
const RTF = Buffer.from('{\\rtf');
const UTF8_BOM = Buffer.from('efbbbf', 'hex');
const UTF16_BOMS = [Buffer.from('fffe', 'hex'), Buffer.from('feff', 'hex')];

// PDF allows some bytes before its header, and real files have them.
const PDF_HEADER_WINDOW = 1024;
const TEXT_SAMPLE_BYTES = 8192;

// Formats that are never text, even though these bytes alone hold no NUL.
const BINARY_SIGNATURES = [
    ZIP,
    OLE,
    PDF,
    Buffer.from('7f454c46', 'hex'), // ELF
    Buffer.from('89504e47', 'hex'), // PNG
    Buffer.from('ffd8ff', 'hex'), // JPEG
];

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLS_MIME = 'application/vnd.ms-excel';

const mismatch = (kind) => `This file is not a valid ${kind} file.`;

function textError(buffer) {
    if (UTF16_BOMS.some((bom) => startsWith(buffer, bom))) {
        return 'UTF-16 text files are not supported. Save the file as UTF-8 and try again.';
    }
    if (BINARY_SIGNATURES.some((signature) => startsWith(buffer, signature))
        || buffer.subarray(0, TEXT_SAMPLE_BYTES).includes(0)) {
        return 'This file is not a valid text file.';
    }
    return null;
}

function startsWith(buffer, prefix) {
    return buffer.subarray(0, prefix.length).equals(prefix);
}

/** The message to reject a file with when its content does not match its type, or null. */
export function signatureError(buffer, mimeType) {
    switch (mimeType) {
        case 'application/pdf':
            return buffer.subarray(0, PDF_HEADER_WINDOW).includes(PDF) ? null : mismatch('PDF');
        case DOCX_MIME:
            // Office saves a password-protected file as an OLE container, not a ZIP.
            if (startsWith(buffer, OLE)) return 'This file is password protected. Remove the password and try again.';
            return startsWith(buffer, ZIP) ? null : mismatch('Word');
        case XLSX_MIME:
            if (startsWith(buffer, OLE)) return 'This file is password protected. Remove the password and try again.';
            return startsWith(buffer, ZIP) ? null : mismatch('Excel');
        case XLS_MIME:
            return startsWith(buffer, OLE) ? null : mismatch('Excel');
        case 'application/rtf':
        case 'text/rtf': {
            const body = startsWith(buffer, UTF8_BOM) ? buffer.subarray(UTF8_BOM.length) : buffer;
            return startsWith(body, RTF) ? null : mismatch('RTF');
        }
        default:
            return textError(buffer);
    }
}
