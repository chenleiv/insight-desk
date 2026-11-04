// Checks a ZIP (.docx, .xlsx) before any parser opens it. A few hundred kilobytes can
// expand to gigabytes, and the sizes a ZIP declares can be forged, so every entry is
// really inflated, under a limit. It walks the central directory, as the parsers do,
// so an entry cannot be hidden from this check and still be read by them.
import { inflateRawSync } from 'zlib';

// Enough for a 10 MB file of images plus a large document's XML.
export const MAX_DECOMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_ENTRIES = 5000;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_SIZE = 22;
const MAX_COMMENT = 0xffff;
const ZIP64_MARKER = 0xffffffff;
const METHOD_STORED = 0;
const METHOD_DEFLATED = 8;
const FLAG_ENCRYPTED = 1;

/** A file that breaks a limit. The message is safe to show the user. */
export class UnsafeFileError extends Error {}

const TOO_LARGE_MESSAGE = 'This file expands to too much data to process.';

export function isZip(buffer) {
    return buffer.length >= 4 && buffer.readUInt32LE(0) === LOCAL_SIGNATURE;
}

function findEndOfCentralDirectory(buffer) {
    const lowest = Math.max(0, buffer.length - EOCD_SIZE - MAX_COMMENT);
    for (let i = buffer.length - EOCD_SIZE; i >= lowest; i--) {
        if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i;
    }
    throw new Error('Not a ZIP file');
}

function inflatedSize(data, method, remaining) {
    if (method === METHOD_STORED) return data.length;
    if (method !== METHOD_DEFLATED) throw new UnsafeFileError('This file uses an unsupported compression method.');
    try {
        return inflateRawSync(data, { maxOutputLength: Math.max(1, remaining) }).length;
    } catch (err) {
        if (err.code === 'ERR_BUFFER_TOO_LARGE') throw new UnsafeFileError(TOO_LARGE_MESSAGE);
        throw err;
    }
}

/**
 * Throws UnsafeFileError when the expanded size or the entry count is over its limit,
 * or the file is encrypted or ZIP64, which no ordinary upload needs. Throws a plain
 * Error when the ZIP is malformed. Returns the entry names.
 */
export function assertSafeZip(buffer, maxBytes = MAX_DECOMPRESSED_BYTES) {
    const eocd = findEndOfCentralDirectory(buffer);
    const count = buffer.readUInt16LE(eocd + 10);
    const directoryOffset = buffer.readUInt32LE(eocd + 16);
    if (count === 0xffff || directoryOffset === ZIP64_MARKER) {
        throw new UnsafeFileError('This file uses an unsupported ZIP format.');
    }
    if (count > MAX_ENTRIES) throw new UnsafeFileError(TOO_LARGE_MESSAGE);

    const names = [];
    let total = 0;
    let at = directoryOffset;
    for (let i = 0; i < count; i++) {
        if (buffer.readUInt32LE(at) !== CENTRAL_SIGNATURE) throw new Error('Malformed ZIP directory');
        const flags = buffer.readUInt16LE(at + 8);
        const method = buffer.readUInt16LE(at + 10);
        const compressedSize = buffer.readUInt32LE(at + 20);
        const nameLength = buffer.readUInt16LE(at + 28);
        const extraLength = buffer.readUInt16LE(at + 30);
        const commentLength = buffer.readUInt16LE(at + 32);
        const localOffset = buffer.readUInt32LE(at + 42);
        if (compressedSize === ZIP64_MARKER || localOffset === ZIP64_MARKER) {
            throw new UnsafeFileError('This file uses an unsupported ZIP format.');
        }
        if (flags & FLAG_ENCRYPTED) throw new UnsafeFileError('This file is password protected. Remove the password and try again.');
        names.push(buffer.toString('utf8', at + 46, at + 46 + nameLength));

        if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) throw new Error('Malformed ZIP entry');
        const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
        const data = buffer.subarray(dataStart, dataStart + compressedSize);
        if (data.length !== compressedSize) throw new Error('Malformed ZIP entry');

        total += inflatedSize(data, method, maxBytes - total);
        if (total > maxBytes) throw new UnsafeFileError(TOO_LARGE_MESSAGE);
        at += 46 + nameLength + extraLength + commentLength;
    }
    return names;
}
