import { createRequire } from 'module';
import { logger } from './logger.js';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

const _require = createRequire(import.meta.url);
const pdfParse = _require('pdf-parse');

const EXCEL_MIMES = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
]);

export async function extractTextFromBuffer(buffer, mimeType) {
    try {
        if (mimeType === 'application/pdf') {
            const data = await pdfParse(buffer);
            return data.text.trim().slice(0, 50000);
        }
        if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const result = await mammoth.extractRawText({ buffer });
            return result.value.trim().slice(0, 50000);
        }
        if (['text/plain', 'text/markdown', 'application/rtf', 'text/rtf'].includes(mimeType)) {
            return buffer.toString('utf-8').trim().slice(0, 50000);
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

export async function extractTextFromUrl(url, mimeType) {
    try {
        const res = await fetch(url);
        if (!res.ok) return '';
        const buffer = Buffer.from(await res.arrayBuffer());
        return extractTextFromBuffer(buffer, mimeType);
    } catch (e) {
        logger.error('Text extraction from URL failed', { message: e.message });
    }
    return '';
}
