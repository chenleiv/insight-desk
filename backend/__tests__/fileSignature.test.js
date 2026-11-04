// @vitest-environment node
import { describe, it, expect } from "vitest";
import { signatureError } from "../fileSignature.js";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLS = "application/vnd.ms-excel";

const zip = Buffer.from("504b030414000000", "hex");
const ole = Buffer.from("d0cf11e0a1b11ae100000000", "hex");
const PROTECTED = "This file is password protected. Remove the password and try again.";

describe("signatureError", () => {
  it.each([
    ["a PDF", Buffer.from("%PDF-1.7\n"), "application/pdf"],
    ["a PDF with bytes before its header", Buffer.concat([Buffer.alloc(100, 0x20), Buffer.from("%PDF-1.4")]), "application/pdf"],
    ["a Word file", zip, DOCX],
    ["an Excel file", zip, XLSX],
    ["a legacy Excel file", ole, XLS],
    ["an RTF file", Buffer.from("{\\rtf1 hello}"), "application/rtf"],
    ["an RTF file with a byte order mark", Buffer.from("﻿{\\rtf1 hello}"), "text/rtf"],
    ["plain text", Buffer.from("hello"), "text/plain"],
    ["Hebrew in a legacy one-byte encoding", Buffer.from("e0e1e2", "hex"), "text/plain"],
    ["UTF-8 text with a byte order mark", Buffer.from("﻿hello"), "text/plain"],
    ["markdown", Buffer.from("# Title"), "text/markdown"],
    ["an empty text file", Buffer.alloc(0), "text/plain"],
  ])("accepts %s", (_name, buffer, mime) => {
    expect(signatureError(buffer, mime)).toBeNull();
  });

  it.each([
    ["text renamed to .pdf", Buffer.from("hello"), "application/pdf", "This file is not a valid PDF file."],
    ["a PDF header too far into the file", Buffer.concat([Buffer.alloc(2000, 0x20), Buffer.from("%PDF-1.4")]), "application/pdf", "This file is not a valid PDF file."],
    ["text renamed to .docx", Buffer.from("hello"), DOCX, "This file is not a valid Word file."],
    ["text renamed to .xlsx", Buffer.from("hello"), XLSX, "This file is not a valid Excel file."],
    ["a ZIP renamed to .xls", zip, XLS, "This file is not a valid Excel file."],
    ["HTML renamed to .xls", Buffer.from("<html></html>"), XLS, "This file is not a valid Excel file."],
    ["text renamed to .rtf", Buffer.from("hello"), "application/rtf", "This file is not a valid RTF file."],
    ["a ZIP renamed to .txt", zip, "text/plain", "This file is not a valid text file."],
    ["a PDF renamed to .md", Buffer.from("%PDF-1.7\n"), "text/markdown", "This file is not a valid text file."],
    ["a PNG renamed to .txt", Buffer.from("89504e470d0a1a0a", "hex"), "text/plain", "This file is not a valid text file."],
    ["binary data with NUL bytes", Buffer.from([0x41, 0x00, 0x42]), "text/plain", "This file is not a valid text file."],
    ["UTF-16 text, little-endian", Buffer.from("fffe680069", "hex"), "text/plain", "UTF-16 text files are not supported. Save the file as UTF-8 and try again."],
    ["UTF-16 text, big-endian", Buffer.from("feff00680069", "hex"), "text/markdown", "UTF-16 text files are not supported. Save the file as UTF-8 and try again."],
    ["a password-protected .xlsx", ole, XLSX, PROTECTED],
    ["a password-protected .docx", ole, DOCX, PROTECTED],
  ])("rejects %s", (_name, buffer, mime, message) => {
    expect(signatureError(buffer, mime)).toBe(message);
  });
});
