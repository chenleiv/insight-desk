import { describe, it, expect, vi, afterEach } from "vitest";
import { attachmentHref } from "../attachmentLink";
import type { Attachment } from "../../../../api/documentsClient";

function att(overrides: Partial<Attachment>): Attachment {
  return { _id: "att-1", url: "", fileName: "f.pdf", fileType: "application/pdf", ...overrides };
}

afterEach(() => vi.unstubAllEnvs());

describe("attachmentHref", () => {
  it("links stored files through the API, ignoring the saved URL", () => {
    vi.stubEnv("VITE_API_BASE", "https://api.example.com/");
    const stored = att({ gridfsId: "g1", url: "http://localhost:8000/api/documents/doc-1/attachments/att-1/file" });
    expect(attachmentHref("doc-1", stored)).toBe("https://api.example.com/api/documents/doc-1/attachments/att-1/file");
  });

  it("uses a relative API path when no API base is set", () => {
    vi.stubEnv("VITE_API_BASE", "");
    expect(attachmentHref("doc-1", att({ gridfsId: "g1" }))).toBe("/api/documents/doc-1/attachments/att-1/file");
  });

  it("gives no link for URL-only attachments, whatever the URL", () => {
    for (const url of [
      "https://nohpeeboyrhslwucxdog.supabase.co/storage/v1/object/public/attachments/a.pdf",
      "https://evil.example.com/login",
      "javascript:alert(1)",
      "not a url",
    ]) {
      expect(attachmentHref("doc-1", att({ gridfsId: null, url }))).toBeNull();
    }
  });
});
