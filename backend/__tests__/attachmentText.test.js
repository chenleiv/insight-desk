// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { extractStoredAttachmentText } from "../attachmentText.js";

const stored = { gridfsId: "file-1", fileType: "text/plain", url: "http://localhost:8000/file" };

describe("extractStoredAttachmentText", () => {
  it("extracts text from the stored file", async () => {
    const readFile = vi.fn(async () => Buffer.from("  Quarterly report\n"));
    expect(await extractStoredAttachmentText(stored, readFile)).toBe("Quarterly report");
    expect(readFile).toHaveBeenCalledWith("file-1");
  });

  it("skips URL-only attachments without fetching anything", async () => {
    const readFile = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const legacy = { gridfsId: null, fileType: "application/pdf", url: "http://169.254.169.254/latest" };
    expect(await extractStoredAttachmentText(legacy, readFile)).toBe("");
    expect(readFile).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("returns empty text when the stored file cannot be read", async () => {
    const readFile = vi.fn(async () => {
      throw new Error("FileNotFound");
    });
    expect(await extractStoredAttachmentText(stored, readFile)).toBe("");
  });
});
