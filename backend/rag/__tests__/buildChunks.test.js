// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildDocumentChunks } from "../buildChunks.js";

const DOC_ID = "665f1c2e8a1b2c3d4e5f6a7b";

describe("buildDocumentChunks", () => {
  it("chunks the content and every attachment's extracted text", () => {
    const doc = {
      _id: DOC_ID,
      content: "Main policy text.",
      attachments: [
        { extractedText: "First attachment text." },
        { extractedText: "Second attachment text." },
      ],
    };

    const chunks = buildDocumentChunks(doc);

    expect(chunks.map((c) => c.text)).toEqual([
      "Main policy text.",
      "First attachment text.",
      "Second attachment text.",
    ]);
  });

  it("numbers chunks continuously and sets docId and a null ownerId", () => {
    const doc = {
      _id: DOC_ID,
      content: "Alpha sentence one. Alpha sentence two. Alpha sentence three.",
      attachments: [{ extractedText: "Beta text." }],
    };

    const chunks = buildDocumentChunks(doc, 30, 5);

    expect(chunks.length).toBeGreaterThan(2);
    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
      expect(chunk.docId).toBe(DOC_ID);
      expect(chunk.ownerId).toBeNull();
    });
    expect(chunks.at(-1).text).toBe("Beta text.");
  });

  it("keeps repeated chunks once, even when whitespace differs", () => {
    const doc = {
      _id: DOC_ID,
      content: "Main policy text.",
      attachments: [
        { extractedText: "Parking passes are issued in January." },
        { extractedText: "Parking passes  are issued\nin January." },
        { extractedText: "Main policy text." },
      ],
    };

    const chunks = buildDocumentChunks(doc);

    expect(chunks.map((c) => c.text)).toEqual([
      "Main policy text.",
      "Parking passes are issued in January.",
    ]);
    expect(chunks.map((c) => c.index)).toEqual([0, 1]);
  });

  it("skips empty sources and handles missing attachments", () => {
    expect(buildDocumentChunks({ _id: DOC_ID, content: "   " })).toEqual([]);

    const chunks = buildDocumentChunks({
      _id: DOC_ID,
      content: "Only content.",
      attachments: [{ extractedText: "" }, {}],
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(0);
  });
});
