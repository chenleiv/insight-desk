// @vitest-environment node
import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import {
  safeFileName,
  buildMarkdown,
  buildPdf,
  buildDocx,
  exportDocument,
  findUndrawableChars,
  ExportError,
  MAX_EXPORT_CHARS,
} from "../documentExport.js";
import { extractTextFromBuffer } from "../textExtract.js";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function docxXml(buffer) {
  return strFromU8(unzipSync(new Uint8Array(buffer))["word/document.xml"]);
}

describe("safeFileName", () => {
  it("keeps a plain title and adds the extension", () => {
    expect(safeFileName("Employee Handbook 2026", "pdf")).toBe("Employee Handbook 2026.pdf");
  });

  it("removes CR and LF so the name cannot add a header", () => {
    const name = safeFileName('a\r\nSet-Cookie: x=1\r\n', "md");
    expect(name).not.toMatch(/[\r\n]/);
    expect(name).toBe("a Set-Cookie x=1.md");
  });

  it("removes quotes and path characters", () => {
    expect(safeFileName('../../etc/"passwd"', "md")).toBe("etc passwd.md");
    expect(safeFileName("..\\..\\windows\\system32", "docx")).toBe("windows system32.docx");
    expect(safeFileName("a:b*c?d<e>f|g", "md")).toBe("a b c d e f g.md");
  });

  it("removes bidi controls that could disguise the extension", () => {
    expect(safeFileName("invoice‮fdp.exe", "md")).toBe("invoice fdp.exe.md");
  });

  it("falls back to 'document' for an empty, dot-only or reserved name", () => {
    expect(safeFileName("", "md")).toBe("document.md");
    expect(safeFileName("  ...  ", "pdf")).toBe("document.pdf");
    expect(safeFileName("\r\n\t", "docx")).toBe("document.docx");
    expect(safeFileName("CON", "md")).toBe("document.md");
    expect(safeFileName(undefined, "md")).toBe("document.md");
  });

  it("keeps Hebrew and caps the length without splitting a character", () => {
    expect(safeFileName("מדריך עובדים", "docx")).toBe("מדריך עובדים.docx");
    const name = safeFileName("😀".repeat(150), "md");
    expect(Array.from(name.replace(/\.md$/, ""))).toHaveLength(100);
    expect(name).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
  });
});

describe("buildMarkdown", () => {
  it("puts the title on one line and keeps the body as written", () => {
    const body = "Line 1\n<script>alert(1)</script>\n```\n<b>code</b>\n```";
    const md = buildMarkdown({ title: "Title\n# injected", category: "HR", content: body });
    expect(md).toBe(`# Title # injected\n\nCategory: HR\n\n${body}\n`);
  });

  it("keeps Hebrew text", () => {
    const md = buildMarkdown({ title: "מדריך", category: "משאבי אנוש", content: "שלום עולם" });
    expect(md).toContain("# מדריך");
    expect(md).toContain("שלום עולם");
  });
});

describe("buildPdf", () => {
  it("writes the text as plain text, so PDF syntax in the content stays text", async () => {
    const content = "Hello ) Tj ET /JavaScript (app.alert(1)) /OpenAction";
    const pdf = await buildPdf({ title: "Café Policy", category: "HR", content });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const text = await extractTextFromBuffer(pdf, "application/pdf");
    expect(text).toContain("Café Policy");
    expect(text).toContain(content);
    expect(pdf.toString("latin1")).not.toMatch(/\/JavaScript|\/OpenAction|\/AA\b/);
  });

  it("rejects characters the PDF font cannot draw, with a message pointing to the other formats", async () => {
    const err = await buildPdf({ title: "Handbook", category: "HR", content: "Hello שלום" }).catch((e) => e);
    expect(err).toBeInstanceOf(ExportError);
    expect(err.status).toBe(422);
    expect(err.message).toMatch(/Latin characters only/);
    expect(err.message).toMatch(/Markdown or Word/);
    expect(err.message).toContain('"ש"');
  });

  it("checks the title and category too", async () => {
    await expect(buildPdf({ title: "מדריך", category: "HR", content: "x" })).rejects.toBeInstanceOf(ExportError);
    await expect(buildPdf({ title: "x", category: "日本", content: "x" })).rejects.toBeInstanceOf(ExportError);
  });

  it("accepts Latin-1 and Windows-1252 punctuation, and turns tabs into spaces", () => {
    expect(findUndrawableChars("naïve café — “quotes” • €5 ™\n")).toEqual([]);
    expect(findUndrawableChars("emoji 😀, Hebrew א, Arabic ب")).toEqual(["😀", "א", "ب"]);
  });
});

describe("buildDocx", () => {
  it("escapes markup in the content instead of injecting it into the XML", async () => {
    const content = '</w:t></w:r></w:p><w:p><w:r><w:t>injected & "quoted"';
    const buffer = await buildDocx({ title: "<b>Title</b>", category: "HR", content });
    const xml = docxXml(buffer);
    expect(xml).toContain("&lt;/w:t&gt;&lt;/w:r&gt;&lt;/w:p&gt;");
    expect(xml).toContain("&lt;b&gt;Title&lt;/b&gt;");
    const { value } = await import("mammoth").then((m) => m.default.extractRawText({ buffer }));
    expect(value).toContain(content);
  });

  it("drops characters XML does not allow, so Word can open the file", async () => {
    const buffer = await buildDocx({ title: "T", category: "C", content: "a\u0000b\u0007c\ud800d" });
    expect(docxXml(buffer)).toContain(">abcd<");
    expect(await extractTextFromBuffer(buffer, DOCX_MIME)).toContain("abcd");
  });

  it("keeps Hebrew text and marks Hebrew paragraphs right to left", async () => {
    const buffer = await buildDocx({ title: "מדריך עובדים", category: "HR", content: "שלום עולם\nEnglish line" });
    const xml = docxXml(buffer);
    const paragraphs = xml.match(/<w:p>.*?<\/w:p>|<w:p .*?<\/w:p>/gs);
    const hebrew = paragraphs.find((p) => p.includes("שלום עולם"));
    const english = paragraphs.find((p) => p.includes("English line"));
    expect(hebrew).toContain("<w:bidi/>");
    expect(hebrew).toContain("<w:rtl/>");
    expect(english).not.toContain("<w:bidi/>");
    const text = await extractTextFromBuffer(buffer, DOCX_MIME);
    expect(text).toContain("מדריך עובדים");
    expect(text).toContain("שלום עולם");
  });
});

describe("exportDocument size cap", () => {
  const big = { title: "Big", category: "HR", content: "a".repeat(MAX_EXPORT_CHARS + 1) };

  it("rejects PDF and Word over the cap with a 422", async () => {
    for (const format of ["pdf", "docx"]) {
      const err = await exportDocument(big, format).catch((e) => e);
      expect(err).toBeInstanceOf(ExportError);
      expect(err.status).toBe(422);
      expect(err.message).toMatch(/only be downloaded as Markdown/);
    }
  });

  it("accepts PDF and Word exactly at the cap", async () => {
    const atCap = { ...big, content: "a".repeat(MAX_EXPORT_CHARS) };
    for (const format of ["pdf", "docx"]) {
      await expect(exportDocument(atCap, format)).resolves.toMatchObject({ fileName: `Big.${format}` });
    }
  });

  it("still allows Markdown over the cap", async () => {
    const { body, fileName, contentType } = await exportDocument(big, "md");
    expect(fileName).toBe("Big.md");
    expect(contentType).toBe("text/markdown; charset=utf-8");
    expect(body.length).toBeGreaterThan(MAX_EXPORT_CHARS);
  });
});
