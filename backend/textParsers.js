// Parsers for uploaded files. Hostile input reaches this code, so it runs only in the
// extraction worker (extractWorker.js), never in the server process. The heavy parsing
// libraries are loaded on demand, so a text file does not pay for them.
import { createRequire } from 'module';
import { assertSafeZip, isZip, UnsafeFileError } from './zipGuard.js';

const _require = createRequire(import.meta.url);

export const MAX_EXTRACTED_CHARS = 50000;
// Only the text of these pages is read. A PDF has no reliable size to check in advance,
// so its decompressed streams are bounded by the worker's memory and time limits.
export const MAX_PDF_PAGES = 200;
// sheet_to_json builds every cell in a sheet's range, and two far-apart cells in a tiny
// file make that range the whole grid, so the range is checked before converting.
export const MAX_SPREADSHEET_CELLS = 1000000;
export const MAX_SPREADSHEET_SHEETS = 50;

const EXCEL_MIMES = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
]);

const TEXT_MIMES = new Set(['text/plain', 'text/markdown', 'application/rtf', 'text/rtf']);
const RTF_MIMES = new Set(['application/rtf', 'text/rtf']);

// RTF groups that hold formatting metadata rather than document text.
const RTF_SKIP_GROUPS = new Set([
    'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'fldinst',
    'listtable', 'listoverridetable', 'header', 'footer', 'headerl', 'headerr',
    'footerl', 'footerr', 'xmlnstbl', 'rsidtbl', 'themedata', 'latentstyles',
]);

const RTF_SYMBOLS = {
    par: '\n', line: '\n', row: '\n', cell: '\t', tab: '\t',
    emdash: '—', endash: '–', bullet: '•',
    lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”',
};

const RTF_CONTROL_WORD = /\\([a-zA-Z]+)(-?\d+)? ?/y;

// Real documents nest a few dozen groups. Deeper groups are counted but their
// state is not saved, so a file of nested braces cannot exhaust memory.
const MAX_RTF_DEPTH = 1000;

/**
 * Remove spaces and tabs before each line break, in linear time. The regex
 * /[ \t]+\n/g backtracks quadratically on a long run of blanks (ReDoS).
 */
function trimBlanksBeforeNewlines(text) {
    let result = '';
    let copyFrom = 0;
    let blanksStart = -1;
    for (let k = 0; k < text.length; k++) {
        const c = text[k];
        if (c === ' ' || c === '\t') {
            if (blanksStart < 0) blanksStart = k;
        } else {
            if (c === '\n' && blanksStart >= 0) {
                result += text.slice(copyFrom, blanksStart);
                copyFrom = k;
            }
            blanksStart = -1;
        }
    }
    return result + text.slice(copyFrom);
}

/**
 * Convert an RTF document to plain text. Keeps paragraphs as line breaks and
 * decodes escaped characters; drops all formatting.
 */
export function rtfToText(rtf) {
    if (typeof rtf !== 'string') throw new TypeError('rtfToText expects a string');
    let out = '';
    let skip = false;
    let ucSkip = 1;       // fallback chars that follow each \uN escape
    let pendingSkip = 0;  // fallback chars still to drop
    let decoder = new TextDecoder('windows-1252');
    const stack = [];
    let depth = 0;

    const emit = (text) => {
        if (skip) return;
        if (pendingSkip > 0) {
            pendingSkip--;
            return;
        }
        out += text;
    };

    let i = 0;
    while (i < rtf.length) {
        const ch = rtf[i];

        if (ch === '{') {
            if (stack.length < MAX_RTF_DEPTH) stack.push({ skip, ucSkip });
            depth++;
            i++;
        } else if (ch === '}') {
            // A group past the cap was not saved, so it has no state to restore.
            if (depth > stack.length) {
                depth--;
            } else {
                ({ skip, ucSkip } = stack.pop() ?? { skip: false, ucSkip: 1 });
                depth = stack.length;
            }
            i++;
        } else if (ch === '\r' || ch === '\n') {
            // Raw line breaks are not content in RTF.
            i++;
        } else if (ch !== '\\') {
            emit(ch);
            i++;
        } else {
            const next = rtf[i + 1];
            if (next === '\\' || next === '{' || next === '}') {
                emit(next);
                i += 2;
            } else if (next === "'") {
                const byte = parseInt(rtf.slice(i + 2, i + 4), 16);
                if (!Number.isNaN(byte)) emit(decoder.decode(Uint8Array.of(byte)));
                i += 4;
            } else if (next === '\r' || next === '\n') {
                emit('\n');
                i += 2;
            } else if (next === '*') {
                skip = true;
                i += 2;
            } else if (next === '~') {
                emit(' ');
                i += 2;
            } else {
                RTF_CONTROL_WORD.lastIndex = i;
                const match = RTF_CONTROL_WORD.exec(rtf);
                if (!match) {
                    i += 2;
                    continue;
                }
                i = RTF_CONTROL_WORD.lastIndex;
                const [, word, param] = match;

                if (RTF_SKIP_GROUPS.has(word)) {
                    skip = true;
                } else if (word === 'u') {
                    const code = Number(param);
                    emit(String.fromCharCode(code < 0 ? code + 65536 : code));
                    if (!skip) pendingSkip = ucSkip;
                } else if (word === 'uc') {
                    ucSkip = Number(param);
                } else if (word === 'ansicpg') {
                    try {
                        decoder = new TextDecoder(`windows-${param}`);
                    } catch {
                        // Unknown code page: keep the default decoder.
                    }
                } else if (RTF_SYMBOLS[word]) {
                    emit(RTF_SYMBOLS[word]);
                }
            }
        }
    }

    return trimBlanksBeforeNewlines(out).replace(/\n{3,}/g, '\n\n');
}

function isRtf(mimeType, text) {
    return RTF_MIMES.has(mimeType) || text.trimStart().startsWith('{\\rtf');
}

function assertSpreadsheetSize(workbook, XLSX) {
    let cells = 0;
    for (const sheetName of workbook.SheetNames) {
        const ref = workbook.Sheets[sheetName]?.['!ref'];
        if (!ref) continue;
        const { s, e } = XLSX.utils.decode_range(ref);
        cells += (e.r - s.r + 1) * (e.c - s.c + 1);
    }
    if (workbook.SheetNames.length > MAX_SPREADSHEET_SHEETS || cells > MAX_SPREADSHEET_CELLS) {
        throw new UnsafeFileError('This spreadsheet is too large to process.');
    }
}

function assertContains(names, prefix, kind) {
    if (!names.some((name) => name.startsWith(prefix))) {
        throw new UnsafeFileError(`This file is not a valid ${kind} file.`);
    }
}

/**
 * The text of a file, at most MAX_EXTRACTED_CHARS long. Throws UnsafeFileError when
 * a limit is exceeded; any other error means the file could not be parsed.
 */
export async function parseFile(buffer, mimeType) {
    if (mimeType === 'application/pdf') {
        const { PDFParse } = _require('pdf-parse');
        const parser = new PDFParse({ data: buffer });
        try {
            // Empty pageJoiner drops the default "-- 1 of N --" page markers.
            const result = await parser.getText({ pageJoiner: '', first: MAX_PDF_PAGES });
            return result.text.trim().slice(0, MAX_EXTRACTED_CHARS);
        } finally {
            await parser.destroy();
        }
    }
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        assertContains(assertSafeZip(buffer), 'word/', 'Word');
        const { default: mammoth } = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        return result.value.trim().slice(0, MAX_EXTRACTED_CHARS);
    }
    if (TEXT_MIMES.has(mimeType)) {
        const text = buffer.toString('utf-8');
        return (isRtf(mimeType, text) ? rtfToText(text) : text).trim().slice(0, MAX_EXTRACTED_CHARS);
    }
    if (EXCEL_MIMES.has(mimeType)) {
        // The library detects the format itself, so any ZIP is checked whatever its claimed type.
        if (isZip(buffer)) assertContains(assertSafeZip(buffer), 'xl/', 'Excel');
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        assertSpreadsheetSize(workbook, XLSX);
        const lines = [];
        for (const sheetName of workbook.SheetNames) {
            lines.push(`[Sheet: ${sheetName}]`);
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
            for (const row of rows) lines.push(row.join('\t'));
        }
        return lines.join('\n').trim().slice(0, MAX_EXTRACTED_CHARS);
    }
    return '';
}
