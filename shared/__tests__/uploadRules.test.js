// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  DEMO_MAX_UPLOAD_BYTES,
  UPLOAD_ACCEPT,
  resolveUploadMime,
  uploadError,
} from "../uploadRules.js";

describe("resolveUploadMime", () => {
  it("keeps a MIME type that belongs to the extension", () => {
    expect(resolveUploadMime("a.pdf", "application/pdf")).toBe("application/pdf");
    expect(resolveUploadMime("a.rtf", "text/rtf")).toBe("text/rtf");
    expect(resolveUploadMime("A.MD", "text/markdown")).toBe("text/markdown");
  });

  it("uses the extension's type when the MIME type is empty or generic", () => {
    expect(resolveUploadMime("notes.md", "")).toBe("text/markdown");
    expect(resolveUploadMime("notes.md", "application/octet-stream")).toBe("text/markdown");
    expect(resolveUploadMime("sheet.xls", undefined)).toBe("application/vnd.ms-excel");
  });

  it("rejects a MIME type that belongs to another type", () => {
    expect(resolveUploadMime("notes.txt", "application/pdf")).toBeNull();
    expect(resolveUploadMime("page.md", "text/html")).toBeNull();
  });

  it("rejects an extension that is not allowed, whatever the MIME type", () => {
    expect(resolveUploadMime("page.html", "text/html")).toBeNull();
    expect(resolveUploadMime("file.bin", "application/pdf")).toBeNull();
    expect(resolveUploadMime("noextension", "application/octet-stream")).toBeNull();
    expect(resolveUploadMime("x.constructor", "")).toBeNull();
  });
});

describe("uploadError", () => {
  it("accepts an allowed file within the size limit", () => {
    expect(uploadError({ name: "a.pdf", type: "application/pdf", size: MAX_UPLOAD_BYTES })).toBeNull();
  });

  it("gives the server's message for a file that is too large", () => {
    expect(uploadError({ name: "a.pdf", type: "application/pdf", size: MAX_UPLOAD_BYTES + 1 }))
      .toBe("File is too large. The maximum size is 10MB.");
  });

  it("applies a smaller limit when given one, naming it", () => {
    expect(uploadError({ name: "a.pdf", type: "application/pdf", size: DEMO_MAX_UPLOAD_BYTES }, DEMO_MAX_UPLOAD_BYTES)).toBeNull();
    expect(uploadError({ name: "a.pdf", type: "application/pdf", size: DEMO_MAX_UPLOAD_BYTES + 1 }, DEMO_MAX_UPLOAD_BYTES))
      .toBe("File is too large. The maximum size is 2MB.");
  });

  it("gives the server's message for a type that is not allowed", () => {
    expect(uploadError({ name: "a.html", type: "text/html", size: 1 })).toBe('File type "text/html" is not allowed');
    expect(uploadError({ name: "a.exe", type: "", size: 1 }))
      .toBe('File type "application/octet-stream" is not allowed');
  });
});

it("lists every allowed extension for file pickers", () => {
  expect(UPLOAD_ACCEPT).toBe(".pdf,.docx,.xlsx,.xls,.txt,.md,.rtf");
});
