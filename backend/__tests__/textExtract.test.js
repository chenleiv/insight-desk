// @vitest-environment node
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { rtfToText, extractTextFromBuffer } from "../textExtract.js";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLS_MIME = "application/vnd.ms-excel";

// Two-sheet workbook, written at runtime in the given format.
function workbookBuffer(bookType) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["name", "qty"], ["apple", 3]]), "Fruits");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["city"], ["Haifa"]]), "Cities");
  return XLSX.write(wb, { type: "buffer", bookType });
}

const WORKBOOK_TEXT = "[Sheet: Fruits]\nname\tqty\napple\t3\n[Sheet: Cities]\ncity\nHaifa";

// Minimal PDF with one text line per page, xref offsets computed at runtime.
function pdfBuffer(pageTexts) {
  const pageIds = pageTexts.map((_, i) => 4 + i * 2);
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageTexts.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (const [i, text] of pageTexts.entries()) {
    const stream = `BT /F1 18 Tf 20 60 Td (${text}) Tj ET`;
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents ${pageIds[i] + 1} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  }
  let pdf = "%PDF-1.4\n";
  const offsets = objs.map((obj, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

// RTF unicode escape for a decimal code point, built at runtime.
const u = (code) => "\\" + "u" + code;

// Hebrew "shalom" as the decoded result of the RTF escapes below.
const SHALOM = String.fromCodePoint(0x5e9, 0x5dc, 0x5d5, 0x5dd);
const SHALOM_RTF = [1513, 1500, 1493, 1501].map((c) => u(c) + " ").join("");

// Shaped like a file saved by macOS TextEdit.
const TEXTEDIT_RTF = String.raw`{\rtf1\ansi\ansicpg1252\cocoartf2907
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
{\*\listtable{\list\listtemplateid1\listhybrid{\listlevel\levelnfc23{\leveltext\leveltemplateid1\'01\uc0${u(8226)} ;}{\levelnumbers;}}{\listname ;}\listid1}}
{\*\listoverridetable{\listoverride\listid1\listoverridecount0\ls1}}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx566\tx1133\pardirnatural\partightenfactor0

\f0\fs24 \cf0 Attachment check.\
Parking passes are issued by the facilities team every January.}`;

describe("rtfToText", () => {
  it("strips TextEdit formatting and keeps only the text", () => {
    expect(rtfToText(TEXTEDIT_RTF).trim()).toBe(
      "Attachment check.\nParking passes are issued by the facilities team every January.",
    );
  });

  it("turns paragraphs into line breaks and tabs into tabs", () => {
    const rtf = String.raw`{\rtf1\ansi First line\par Second\tab line\par}`;
    expect(rtfToText(rtf)).toBe("First line\nSecond\tline\n");
  });

  it("decodes hex, unicode and escaped characters, including Hebrew", () => {
    const rtf = String.raw`{\rtf1\ansi\ansicpg1252 caf\'e9 \{x\} \\ \uc0` + SHALOM_RTF + String.raw`\emdash}`;
    expect(rtfToText(rtf)).toBe(`caf${String.fromCodePoint(0xe9)} {x} \\ ${SHALOM}${String.fromCodePoint(0x2014)}`);
  });

  it("skips the fallback character after a unicode escape", () => {
    const rtf = String.raw`{\rtf1\ansi\uc1` + u(1513) + "?" + u(1500) + "?}";
    expect(rtfToText(rtf)).toBe(SHALOM.slice(0, 2));
  });
});

describe("extractTextFromBuffer", () => {
  it("converts RTF even when the browser reports it as plain text", async () => {
    const text = await extractTextFromBuffer(Buffer.from(TEXTEDIT_RTF), "text/plain");
    expect(text.startsWith("Attachment check.")).toBe(true);
    expect(text).not.toContain("\\");
  });

  it("returns plain text and markdown unchanged", async () => {
    const md = "# Title\n\nSome {braces} and a back\\slash.";
    expect(await extractTextFromBuffer(Buffer.from(`  ${md}\n`), "text/markdown")).toBe(md);
  });

  it("extracts every sheet of an .xlsx file as tab-separated rows", async () => {
    expect(await extractTextFromBuffer(workbookBuffer("xlsx"), XLSX_MIME)).toBe(WORKBOOK_TEXT);
  });

  it("extracts every sheet of a legacy .xls file", async () => {
    expect(await extractTextFromBuffer(workbookBuffer("biff8"), XLS_MIME)).toBe(WORKBOOK_TEXT);
  });

  it("extracts the text of every PDF page without page markers", async () => {
    const text = await extractTextFromBuffer(pdfBuffer(["First page", "Second page"]), "application/pdf");
    expect(text).toContain("First page");
    expect(text).toContain("Second page");
    expect(text).not.toMatch(/-- \d+ of \d+ --/);
  });
});
