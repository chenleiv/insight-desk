import { describe, it, expect, vi, afterEach } from "vitest";
import { downloadDocument, fileNameFromDisposition } from "../documentsClient";
import { ApiError } from "../base";

afterEach(() => vi.unstubAllGlobals());

describe("fileNameFromDisposition", () => {
  it("prefers the UTF-8 name", () => {
    const header = `attachment; filename="?????.docx"; filename*=UTF-8''%D7%9E%D7%93%D7%A8%D7%99%D7%9A.docx`;
    expect(fileNameFromDisposition(header, "document.docx")).toBe("מדריך.docx");
  });

  it("uses the plain name when there is no UTF-8 name", () => {
    expect(fileNameFromDisposition('attachment; filename="Handbook.pdf"', "document.pdf")).toBe("Handbook.pdf");
  });

  it("falls back when the header is missing or malformed", () => {
    expect(fileNameFromDisposition(null, "document.md")).toBe("document.md");
    expect(fileNameFromDisposition("attachment; filename*=UTF-8''%E0%A4%A", "document.md")).toBe("document.md");
  });
});

describe("downloadDocument", () => {
  it("requests the format with cookies and returns the blob and file name", async () => {
    const fetchMock = vi.fn(async () => new Response("# Hi\n", {
      headers: { "Content-Disposition": 'attachment; filename="Hi.md"' },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { blob, fileName } = await downloadDocument("doc-1", "md");

    expect(fetchMock).toHaveBeenCalledWith("/api/documents/doc-1/download?format=md", { credentials: "include" });
    expect(await blob.text()).toBe("# Hi\n");
    expect(fileName).toBe("Hi.md");
  });

  it("throws the server's message, such as the PDF character limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "PDF export supports Latin characters only" }),
      { status: 422 },
    )));

    const err = await downloadDocument("doc-1", "pdf").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(422);
    expect((err as ApiError).message).toBe("PDF export supports Latin characters only");
  });
});
