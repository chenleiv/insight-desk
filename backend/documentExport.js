// Builds a downloadable file (Markdown, PDF or Word) from a document's title,
// category and content. Attachments are not included.
import PDFDocument from 'pdfkit';
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';

export const EXPORT_FORMATS = {
    md: { ext: 'md', contentType: 'text/markdown; charset=utf-8' },
    pdf: { ext: 'pdf', contentType: 'application/pdf' },
    docx: {
        ext: 'docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
};

// PDF and Word are built in memory on the request thread, so their input is capped.
// At this size either takes well under a second, whatever the text looks like.
export const MAX_EXPORT_CHARS = 200000;

// A 422 with a message that is safe to show the user.
export class ExportError extends Error {
    constructor(message) {
        super(message);
        this.status = 422;
    }
}

// Control characters (including CR and LF), characters that are not allowed in file
// names on common systems, and bidi controls that can disguise the extension.
const UNSAFE_NAME_CHARS = /[\u0000-\u001f\u007f-\u009f\\/:*?"<>|‎‏‪-‮⁦-⁩]/g;
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
const MAX_NAME_LENGTH = 100;

export function safeFileName(title, ext) {
    const cleaned = String(title ?? '')
        .normalize('NFC')
        .replace(UNSAFE_NAME_CHARS, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[.\s]+|[.\s]+$/g, '');
    // Count code points so a cut never splits a surrogate pair.
    const base = Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join('').trim();
    const name = base && !RESERVED_WINDOWS_NAMES.test(base) ? base : 'document';
    return `${name}.${ext}`;
}

function singleLine(text) {
    return String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

// XML 1.0 rejects most control characters and lone surrogates, and Word refuses
// a file that contains them. Tabs become spaces so the PDF fonts can draw them.
function cleanBody(text) {
    return String(text ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/\t/g, '    ')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
        .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '');
}

// The body is the user's own Markdown and is kept as written. The file is served as
// an attachment with nosniff, so the browser saves it and never renders it.
export function buildMarkdown(doc) {
    return `# ${singleLine(doc.title)}\n\nCategory: ${singleLine(doc.category)}\n\n${doc.content ?? ''}\n`;
}

// The built-in PDF fonts cover the Windows-1252 set only: Latin-1 plus these extras.
const WIN_ANSI_EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

function isPdfDrawable(char) {
    const code = char.codePointAt(0);
    return char === '\n'
        || (code >= 0x20 && code <= 0x7e)
        || (code >= 0xa0 && code <= 0xff)
        || WIN_ANSI_EXTRAS.has(char);
}

// Returns up to `limit` distinct characters the PDF fonts cannot draw.
export function findUndrawableChars(text, limit = 5) {
    const found = new Set();
    for (const char of text) {
        if (!isPdfDrawable(char)) {
            found.add(char);
            if (found.size >= limit) break;
        }
    }
    return [...found];
}

// pdfkit wraps a word wider than the line in time quadratic in its length (a 200,000
// character word takes seconds), so very long runs are split onto new lines first.
const MAX_PDF_WORD = 500;
const LONG_WORD = new RegExp(`\\S{${MAX_PDF_WORD}}(?=\\S)`, 'g');

export async function buildPdf(doc) {
    const title = singleLine(doc.title);
    const category = singleLine(doc.category);
    const content = cleanBody(doc.content).replace(LONG_WORD, '$&\n');
    const undrawable = findUndrawableChars(`${title}\n${category}\n${content}`);
    if (undrawable.length) {
        throw new ExportError(
            'PDF export supports Latin characters only, and this document contains others '
            + `(such as ${undrawable.map((c) => JSON.stringify(c)).join(', ')}). `
            + 'Download it as Markdown or Word instead.',
        );
    }

    return new Promise((resolve, reject) => {
        const pdf = new PDFDocument({ size: 'A4', margin: 56 });
        const chunks = [];
        pdf.on('data', (chunk) => chunks.push(chunk));
        pdf.on('end', () => resolve(Buffer.concat(chunks)));
        pdf.on('error', reject);

        pdf.font('Helvetica-Bold').fontSize(18).text(title);
        pdf.moveDown(0.3);
        pdf.font('Helvetica').fontSize(10).fillColor('#666666').text(category);
        pdf.moveDown();
        pdf.fontSize(11).fillColor('#000000').text(content);
        pdf.end();
    });
}

// Word lays a paragraph out right to left when its first letter is Hebrew or Arabic.
const RTL_LETTER = /[\p{Script=Hebrew}\p{Script=Arabic}]/u;

function isRtl(text) {
    const firstLetter = text.match(/\p{L}/u)?.[0];
    return !!firstLetter && RTL_LETTER.test(firstLetter);
}

// TextRun text is XML-escaped by the docx library, so content cannot add markup.
function docxParagraph(text, options = {}) {
    const rtl = isRtl(text);
    return new Paragraph({
        ...options,
        bidirectional: rtl,
        children: [new TextRun({ text, rightToLeft: rtl })],
    });
}

export function buildDocx(doc) {
    const title = singleLine(doc.title);
    const category = singleLine(doc.category);
    const lines = cleanBody(doc.content).split('\n');
    const file = new DocxDocument({
        title,
        sections: [{
            children: [
                docxParagraph(title, { heading: HeadingLevel.TITLE }),
                docxParagraph(category, { heading: HeadingLevel.HEADING_3 }),
                ...lines.map((line) => docxParagraph(line)),
            ],
        }],
    });
    return Packer.toBuffer(file);
}

const BUILDERS = { md: buildMarkdown, pdf: buildPdf, docx: buildDocx };

// Returns { body, fileName, contentType } for a supported format.
export async function exportDocument(doc, format) {
    const { ext, contentType } = EXPORT_FORMATS[format];
    if (format !== 'md' && (doc.content ?? '').length > MAX_EXPORT_CHARS) {
        throw new ExportError(
            `Documents over ${MAX_EXPORT_CHARS.toLocaleString('en-US')} characters can only be `
            + 'downloaded as Markdown.',
        );
    }
    const body = await BUILDERS[format](doc);
    return { body, fileName: safeFileName(doc.title, ext), contentType };
}
