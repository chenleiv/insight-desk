import { createRequire } from 'module';
import { lookup as dnsLookupCallback } from 'node:dns';
import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { Agent } from 'undici';
import { logger } from './logger.js';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

const _require = createRequire(import.meta.url);
const { PDFParse } = _require('pdf-parse');

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

/**
 * Convert an RTF document to plain text. Keeps paragraphs as line breaks and
 * decodes escaped characters; drops all formatting.
 */
export function rtfToText(rtf) {
    let out = '';
    let skip = false;
    let ucSkip = 1;       // fallback chars that follow each \uN escape
    let pendingSkip = 0;  // fallback chars still to drop
    let decoder = new TextDecoder('windows-1252');
    const stack = [];

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
            stack.push({ skip, ucSkip });
            i++;
        } else if (ch === '}') {
            ({ skip, ucSkip } = stack.pop() ?? { skip: false, ucSkip: 1 });
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

    return out
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n');
}

function isRtf(mimeType, text) {
    return RTF_MIMES.has(mimeType) || text.trimStart().startsWith('{\\rtf');
}

export async function extractTextFromBuffer(buffer, mimeType) {
    try {
        if (mimeType === 'application/pdf') {
            const parser = new PDFParse({ data: buffer });
            try {
                // Empty pageJoiner drops the default "-- 1 of N --" page markers.
                const result = await parser.getText({ pageJoiner: '' });
                return result.text.trim().slice(0, 50000);
            } finally {
                await parser.destroy();
            }
        }
        if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const result = await mammoth.extractRawText({ buffer });
            return result.value.trim().slice(0, 50000);
        }
        if (TEXT_MIMES.has(mimeType)) {
            const text = buffer.toString('utf-8');
            return (isRtf(mimeType, text) ? rtfToText(text) : text).trim().slice(0, 50000);
        }
        if (EXCEL_MIMES.has(mimeType)) {
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const lines = [];
            for (const sheetName of workbook.SheetNames) {
                lines.push(`[Sheet: ${sheetName}]`);
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
                for (const row of rows) lines.push(row.join('\t'));
            }
            return lines.join('\n').trim().slice(0, 50000);
        }
    } catch (e) {
        logger.error('Text extraction failed', { message: e.message });
    }
    return '';
}

export const MAX_URL_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const URL_TIMEOUT_MS = 10_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

class UrlFetchError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

// Loopback, private, link-local, shared, reserved and multicast ranges.
// IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) are matched against the IPv4 rules.
const BLOCKED_ADDRESSES = new BlockList();
for (const [network, prefix] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16],
    ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) BLOCKED_ADDRESSES.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
    ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
]) BLOCKED_ADDRESSES.addSubnet(network, prefix, 'ipv6');

function isBlockedAddress(address) {
    const family = isIP(address);
    return family === 0 || BLOCKED_ADDRESSES.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

function notAllowed() {
    return new UrlFetchError('URL_NOT_ALLOWED', 'URL is not allowed');
}

// Checks the scheme and every address the host resolves to, before the request.
async function assertPublicUrl(rawUrl) {
    let url;
    try {
        url = new URL(rawUrl);
    } catch {
        throw notAllowed();
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw notAllowed();

    const host = url.hostname.replace(/^\[|\]$/g, '');
    let addresses;
    try {
        addresses = isIP(host) ? [{ address: host }] : await dnsLookup(host, { all: true });
    } catch {
        throw notAllowed();
    }
    if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
        throw notAllowed();
    }
}

// Runs again when the socket connects, so a DNS answer that changes after
// assertPublicUrl (DNS rebinding) still cannot reach an internal address.
function guardedLookup(hostname, options, callback) {
    dnsLookupCallback(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err);
        if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
            return callback(notAllowed());
        }
        if (options.all) return callback(null, addresses);
        callback(null, addresses[0].address, addresses[0].family);
    });
}

const guardedAgent = new Agent({ connect: { lookup: guardedLookup } });

async function readLimitedBody(response) {
    if (Number(response.headers.get('content-length')) > MAX_URL_BYTES) {
        await response.body?.cancel();
        throw new UrlFetchError('RESPONSE_TOO_LARGE', 'Response is too large');
    }
    const chunks = [];
    let total = 0;
    if (response.body) {
        for await (const chunk of response.body) {
            total += chunk.byteLength;
            if (total > MAX_URL_BYTES) {
                // Leaving the loop early cancels the stream.
                throw new UrlFetchError('RESPONSE_TOO_LARGE', 'Response is too large');
            }
            chunks.push(chunk);
        }
    }
    return Buffer.concat(chunks);
}

// Fetch a document from a user-supplied URL and extract its text.
// Redirects are followed by hand so every hop is checked again.
export async function extractTextFromUrl(rawUrl) {
    const signal = AbortSignal.timeout(URL_TIMEOUT_MS);
    let url = rawUrl;
    for (let hop = 0; ; hop++) {
        await assertPublicUrl(url);
        const response = await fetch(url, { redirect: 'manual', signal, dispatcher: guardedAgent });

        if (REDIRECT_STATUSES.has(response.status)) {
            await response.body?.cancel();
            const location = response.headers.get('location');
            if (hop >= MAX_REDIRECTS) {
                throw new UrlFetchError('TOO_MANY_REDIRECTS', 'Too many redirects');
            }
            if (!location) throw new UrlFetchError('FETCH_FAILED', 'Redirect without a location');
            url = new URL(location, url).href;
            continue;
        }
        if (!response.ok) {
            await response.body?.cancel();
            throw new UrlFetchError('FETCH_FAILED', `Upstream responded with ${response.status}`);
        }

        const buffer = await readLimitedBody(response);
        const mimeType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
        return extractTextFromBuffer(buffer, mimeType);
    }
}
