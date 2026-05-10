import * as XLSX from "xlsx";
import mammoth from "mammoth";
import type { DocumentInput } from "../../../api/documentsClient";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_FILES = 50;

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function sanitizeObject(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([k]) => !DANGEROUS_KEYS.has(k))
        .map(([k, v]) => [k, sanitizeObject(v)])
    );
  }
  return obj;
}

function basename(filename: string) {
  return filename.replace(/\.[^.]+$/, "");
}

function parseMd(text: string): Partial<DocumentInput> {
  const lines = text.split("\n");
  let title = "";
  let contentStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#{1,6}\s+(.+)/);
    if (m) {
      title = m[1].trim();
      contentStart = i + 1;
      break;
    }
  }

  const remaining = lines.slice(contentStart);

  let summary = "";
  let summaryEnd = 0;
  for (let i = 0; i < remaining.length; i++) {
    const line = remaining[i].trim();
    if (line && !line.startsWith("#")) {
      summary = line;
      summaryEnd = i + 1;
      break;
    }
  }

  const content = remaining.slice(summaryEnd).join("\n").trim();
  return { title, summary, content };
}

function parseRtf(rtf: string): string {
  return rtf
    .replace(/\{\\\*\\[^}]*\}/g, "")
    .replace(/\\par[d]?\b/g, "\n")
    .replace(/\\line\b/g, "\n")
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex) => {
      try { return String.fromCharCode(parseInt(hex, 16)); } catch { return ""; }
    })
    .replace(/\\[a-z*]+[-]?\d*\s?/gi, "")
    .replace(/[{}\\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function parseImportFile(
  file: File
): Promise<Partial<DocumentInput>[]> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`"${file.name}" is too large (max 5MB)`);
  }

  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "json") {
    const text = await file.text();
    const parsed = sanitizeObject(JSON.parse(text));
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return (arr as Record<string, unknown>[]).map(({ id: _id, _id: __id, ...rest }) => rest as Partial<DocumentInput>);
  }

  if (ext === "txt") {
    const text = await file.text();
    return [{ title: basename(file.name), content: text.trim() }];
  }

  if (ext === "md") {
    const text = await file.text();
    const doc = parseMd(text);
    if (!doc.title) doc.title = basename(file.name);
    return [doc];
  }

  if (ext === "rtf") {
    const text = await file.text();
    return [{ title: basename(file.name), content: parseRtf(text) }];
  }

  if (ext === "xlsx") {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    return rows.map((row) => sanitizeObject({
      title: String(row.title ?? row.Title ?? ""),
      category: String(row.category ?? row.Category ?? ""),
      summary: String(row.summary ?? row.Summary ?? ""),
      content: String(row.content ?? row.Content ?? ""),
    })) as Partial<DocumentInput>[];
  }

  if (ext === "docx") {
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return [{ title: basename(file.name), content: result.value.trim() }];
  }

  throw new Error(`Unsupported file type: .${ext}`);
}

export async function parseImportFiles(files: File[]): Promise<Partial<DocumentInput>[]> {
  if (files.length > MAX_FILES) {
    throw new Error(`Too many files selected (max ${MAX_FILES})`);
  }
  const results = await Promise.all(files.map(parseImportFile));
  return results.flat();
}
