// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { deflateSync } from "zlib";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { zipSync, strToU8 } from "fflate";
import * as XLSX from "xlsx";

vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
// Records how the worker is started; it still really runs.
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

import { spawn } from "child_process";
import { logger } from "../logger.js";
import { extractTextFromBuffer, EXTRACTION_LIMITS, MAX_WAITING_EXTRACTIONS } from "../textExtract.js";
import { assertSafeZip, MAX_DECOMPRESSED_BYTES, UnsafeFileError } from "../zipGuard.js";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME = "application/pdf";

// These files really run through the worker up to its limits, so they get more than the default 5 seconds.
const WORKER_LIMIT_TIMEOUT = 2 * EXTRACTION_LIMITS.timeMs;

const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

// A spreadsheet of two cells at opposite corners: 1.4 KB, but its range is the whole sheet grid.
function wideSpreadsheet() {
  return Buffer.from(zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    "_rels/.rels": strToU8(`<?xml version="1.0"?><Relationships xmlns="${REL_NS}"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="s" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8('<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c></row><row r="1048576"><c r="XFD1048576" t="inlineStr"><is><t>b</t></is></c></row></sheetData></worksheet>'),
  }, { level: 9 }));
}

// A small Word file whose XML expands to about `megabytes` MB.
function expandingDocx(megabytes) {
  const paragraph = `<w:p><w:r><w:t>${"a".repeat(1000)}</w:t></w:r></w:p>`;
  return Buffer.from(zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    "_rels/.rels": strToU8(`<?xml version="1.0"?><Relationships xmlns="${REL_NS}"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    "word/document.xml": strToU8(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph.repeat(megabytes * 1000)}</w:body></w:document>`),
  }, { level: 9 }));
}

// A one-page PDF whose compressed content stream expands to about `megabytes` MB.
function expandingPdf(megabytes) {
  const operators = "BT /F1 12 Tf 72 720 Td (a) Tj ET\n";
  const stream = deflateSync(Buffer.from(operators.repeat(Math.ceil((megabytes * 1e6) / operators.length))), { level: 9 });
  const parts = [];
  const offsets = [];
  let position = 0;
  const add = (value) => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "latin1");
    parts.push(bytes);
    position += bytes.length;
  };
  const object = (id, body) => {
    offsets[id] = position;
    add(`${id} 0 obj\n${body}\nendobj\n`);
  };
  add("%PDF-1.4\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>");
  offsets[4] = position;
  add(`4 0 obj\n<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`);
  add(stream);
  add("\nendstream\nendobj\n");
  object(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const xref = position;
  add("xref\n0 6\n0000000000 65535 f \n");
  for (let id = 1; id <= 5; id++) add(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(parts);
}

function validSpreadsheet() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["name", "qty"], ["apple", 3]]), "Fruits");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
const VALID_TEXT = "[Sheet: Fruits]\nname\tqty\napple\t3";

// Offsets of every central directory record, by scanning for its signature.
function centralRecords(zip) {
  const offsets = [];
  for (let i = 0; i <= zip.length - 4; i++) if (zip.readUInt32LE(i) === 0x02014b50) offsets.push(i);
  return offsets;
}

// A worker the test controls, for outcomes a real one cannot be made to reach.
function fakeWorker() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stdio = [child.stdin, child.stdout, null, new PassThrough()];
  child.kill = vi.fn(() => {
    child.emit("close", null, "SIGKILL");
    return true;
  });
  return child;
}

function loggedStop() {
  return vi.mocked(logger.warn).mock.calls.find(([message]) => message === "Extraction worker stopped")?.[1];
}

beforeEach(() => {
  vi.mocked(spawn).mockClear();
  vi.mocked(logger.warn).mockClear();
});

describe("hostile files", () => {
  it.each([
    ["a 1.4 KB spreadsheet covering the whole grid", wideSpreadsheet, XLSX_MIME, "This spreadsheet is too large to process."],
    ["a small Word file that expands past the limit", () => expandingDocx(30), DOCX_MIME, "This file expands to too much data to process."],
    ["a small PDF that expands past the memory limit", () => expandingPdf(300), PDF_MIME, "This file could not be processed. It may be too large or too complex."],
  ])("refuses %s, and the server keeps working", async (_name, build, mime, message) => {
    const error = await extractTextFromBuffer(build(), mime).catch((err) => err);
    expect(error.isExtractionError).toBe(true);
    expect(error.status).toBe(422);
    expect(error.message).toBe(message);

    expect(await extractTextFromBuffer(validSpreadsheet(), XLSX_MIME)).toBe(VALID_TEXT);
  }, WORKER_LIMIT_TIMEOUT);

  it("refuses a file that outlasts the time limit", async () => {
    const limits = { ...EXTRACTION_LIMITS, timeMs: 1 };
    const error = await extractTextFromBuffer(validSpreadsheet(), XLSX_MIME, limits).catch((err) => err);
    expect(error.status).toBe(422);
  });

  it("refuses a file that goes over the total memory limit, even when the V8 heap has room", async () => {
    // With this much heap the parse would finish, so only the watchdog can stop it.
    const limits = { ...EXTRACTION_LIMITS, heapMB: 2048, totalMB: 120 };
    const error = await extractTextFromBuffer(expandingPdf(300), PDF_MIME, limits).catch((err) => err);
    expect(error.status).toBe(422);
  }, WORKER_LIMIT_TIMEOUT);
});

describe("large legitimate files", () => {
  it("still extracts a Word file with 10 MB of XML", async () => {
    const text = await extractTextFromBuffer(expandingDocx(10), DOCX_MIME).catch((err) => err);
    // Checked first, so a failure prints why the worker stopped.
    expect(logger.warn).not.toHaveBeenCalled();
    expect(text).toHaveLength(50000);
  }, WORKER_LIMIT_TIMEOUT);

  it("still extracts a spreadsheet of 100,000 cells", async () => {
    const rows = Array.from({ length: 10000 }, (_, r) => Array.from({ length: 10 }, (_, c) => `r${r}c${c}`));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Big");
    const text = await extractTextFromBuffer(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), XLSX_MIME);
    expect(text.startsWith("[Sheet: Big]\nr0c0\t")).toBe(true);
  }, WORKER_LIMIT_TIMEOUT);

  it("reads a PDF of 300 pages only as far as the page limit", async () => {
    const pageCount = 300;
    const pageIds = Array.from({ length: pageCount }, (_, i) => 4 + i * 2);
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    for (let i = 0; i < pageCount; i++) {
      const stream = `BT /F1 18 Tf 20 60 Td (Page${i + 1}end) Tj ET`;
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents ${pageIds[i] + 1} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      );
    }
    let pdf = "%PDF-1.4\n";
    const offsets = objects.map((object, i) => {
      const offset = pdf.length;
      pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
      return offset;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

    const text = await extractTextFromBuffer(Buffer.from(pdf, "latin1"), PDF_MIME);
    expect(text).toContain("Page200end");
    expect(text).not.toContain("Page201end");
  }, WORKER_LIMIT_TIMEOUT);
});

describe("why the worker stopped", () => {
  it.each([
    ["time", validSpreadsheet, XLSX_MIME, { timeMs: 1 }],
    ["memory", () => expandingPdf(300), PDF_MIME, { heapMB: 2048, totalMB: 120 }],
    ["heap", () => expandingDocx(10), DOCX_MIME, { heapMB: 20, totalMB: 4096 }],
  ])("logs %s as the reason", async (reason, build, mime, overrides) => {
    const error = await extractTextFromBuffer(build(), mime, { ...EXTRACTION_LIMITS, ...overrides }).catch((err) => err);
    expect(error.status).toBe(422);
    expect(loggedStop().reason).toBe(reason);
    if (reason === "memory") expect(loggedStop().rssMB).toBeGreaterThanOrEqual(120);
    else expect(loggedStop().rssMB).toBeNull();
  }, WORKER_LIMIT_TIMEOUT);

  it("logs output as the reason when the worker writes too much", async () => {
    const child = fakeWorker();
    vi.mocked(spawn).mockImplementationOnce(() => child);
    const result = extractTextFromBuffer(Buffer.from("hello"), "text/plain").catch((err) => err);
    child.stdout.write(Buffer.alloc(400 * 1000 + 1));
    expect((await result).status).toBe(422);
    expect(loggedStop().reason).toBe("output");
  });

  it.each([
    ["an unknown reason", '{"reason":"anything","rssMB":1}'],
    ["a size that is not a whole number", '{"reason":"memory","rssMB":"1"}'],
    ["text that is not JSON", "not json"],
    ["an oversized report", `{"reason":"memory","rssMB":1,"pad":"${"x".repeat(200)}"}`],
  ])("logs unknown for %s on the report pipe", async (_name, report) => {
    const child = fakeWorker();
    vi.mocked(spawn).mockImplementationOnce(() => child);
    const result = extractTextFromBuffer(Buffer.from("hello"), "text/plain").catch((err) => err);
    child.stdio[3].write(report);
    await new Promise(setImmediate);
    child.emit("close", null, "SIGKILL");
    expect((await result).status).toBe(422);
    expect(loggedStop().reason).toBe("unknown");
    expect(loggedStop().rssMB).toBeNull();
  });

  it("logs only the listed fields and nothing from the file", async () => {
    const marker = "private-document-marker";
    await extractTextFromBuffer(Buffer.from(marker), "text/plain", { ...EXTRACTION_LIMITS, timeMs: 1 }).catch((err) => err);
    expect(Object.keys(loggedStop()).sort()).toEqual(["code", "elapsedMs", "inputBytes", "mimeType", "reason", "rssMB", "signal"]);
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain(marker);
  });
});

describe("the worker", () => {
  it("starts with the young generation capped next to the heap limit", async () => {
    await extractTextFromBuffer(Buffer.from("hello"), "text/plain");
    expect(vi.mocked(spawn).mock.calls[0][1].slice(0, 2)).toEqual(["--max-old-space-size=160", "--max-semi-space-size=8"]);
  });

  it("keeps its limits", () => {
    expect(EXTRACTION_LIMITS).toEqual({ timeMs: 20000, heapMB: 160, totalMB: 256 });
    expect(MAX_DECOMPRESSED_BYTES).toBe(20 * 1024 * 1024);
  });

  it("gets no environment, so a hostile file cannot reach the server's secrets", async () => {
    await extractTextFromBuffer(Buffer.from("hello"), "text/plain");
    expect(vi.mocked(spawn).mock.calls[0][2].env).toEqual({});
  });

  it("returns an empty text for a damaged file, as before", async () => {
    expect(await extractTextFromBuffer(Buffer.from("not a zip"), DOCX_MIME)).toBe("");
  });

  it("refuses a ZIP without the parts of its claimed type", async () => {
    const other = Buffer.from(zipSync({ "notes.txt": strToU8("hello") }));
    const error = await extractTextFromBuffer(other, DOCX_MIME).catch((err) => err);
    expect(error.status).toBe(422);
    expect(error.message).toBe("This file is not a valid Word file.");
  });
});

describe("the queue", () => {
  it("parses one file at a time and refuses files beyond the waiting limit with a 503", async () => {
    const file = Buffer.from("hello");
    const accepted = Array.from({ length: MAX_WAITING_EXTRACTIONS + 1 }, () => extractTextFromBuffer(file, "text/plain"));
    expect(spawn).toHaveBeenCalledTimes(1);

    const refused = await extractTextFromBuffer(file, "text/plain").catch((err) => err);
    expect(refused.status).toBe(503);
    expect(refused.retryAfter).toBeGreaterThan(0);

    expect(await Promise.all(accepted)).toEqual(accepted.map(() => "hello"));
    expect(spawn).toHaveBeenCalledTimes(accepted.length);
  });

  it("moves on to the next file after one fails", async () => {
    const failing = extractTextFromBuffer(validSpreadsheet(), XLSX_MIME, { ...EXTRACTION_LIMITS, timeMs: 1 }).catch((err) => err.status);
    const next = extractTextFromBuffer(Buffer.from("hello"), "text/plain");
    expect(await failing).toBe(422);
    expect(await next).toBe("hello");
  });
});

describe("assertSafeZip", () => {
  it("accepts a normal archive and returns its entry names", () => {
    const zip = Buffer.from(zipSync({ "a.txt": strToU8("hello"), "b/c.txt": strToU8("world") }));
    expect(assertSafeZip(zip)).toEqual(["a.txt", "b/c.txt"]);
  });

  it("counts the real size when the archive lies about it", () => {
    const zip = expandingDocx(30);
    for (const record of centralRecords(zip)) zip.writeUInt32LE(1, record + 24);
    expect(() => assertSafeZip(zip)).toThrow(UnsafeFileError);
  });

  it("adds up entries that are each under the limit", () => {
    const part = new Uint8Array(Math.ceil(MAX_DECOMPRESSED_BYTES / 2) + 1);
    const zip = Buffer.from(zipSync({ "a.bin": part, "b.bin": part, "c.bin": part }, { level: 9 }));
    expect(() => assertSafeZip(zip)).toThrow(UnsafeFileError);
  });

  it("refuses a password-protected entry", () => {
    const zip = Buffer.from(zipSync({ "a.txt": strToU8("hello") }));
    const [record] = centralRecords(zip);
    zip.writeUInt16LE(zip.readUInt16LE(record + 8) | 1, record + 8);
    expect(() => assertSafeZip(zip)).toThrow("password protected");
  });

  it("refuses a compression method the parsers should not be handed", () => {
    const zip = Buffer.from(zipSync({ "a.txt": strToU8("hello") }, { level: 9 }));
    const [record] = centralRecords(zip);
    zip.writeUInt16LE(99, record + 10);
    expect(() => assertSafeZip(zip)).toThrow(UnsafeFileError);
  });

  it("treats a file with no ZIP directory as malformed, not as a limit", () => {
    let error;
    try {
      assertSafeZip(Buffer.from("this is not an archive at all, just some text"));
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnsafeFileError);
  });
});
