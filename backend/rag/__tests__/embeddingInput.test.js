// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { embeddingText, embeddingKey } from "../embeddingInput.js";

afterEach(() => {
  vi.doUnmock("../embeddingModel.js");
  vi.resetModules();
});

/** embeddingKey as it would be computed with other model or format constants. */
async function keyWith(overrides, title, text) {
  vi.resetModules();
  vi.doMock("../embeddingModel.js", async (importOriginal) => ({ ...(await importOriginal()), ...overrides }));
  const { embeddingKey: key } = await import("../embeddingInput.js");
  return key(title, text);
}

describe("embeddingText", () => {
  it("puts the document title before the chunk text", () => {
    expect(embeddingText("OAuth 2.0 Authorization Flows", "Common flows: ..."))
      .toBe("OAuth 2.0 Authorization Flows\n\nCommon flows: ...");
  });

  it("is the chunk text alone when the document has no title", () => {
    expect(embeddingText(undefined, "Some text.")).toBe("Some text.");
    expect(embeddingText("  ", "Some text.")).toBe("Some text.");
  });
});

describe("embeddingKey", () => {
  it("is the same for the same title and text", () => {
    expect(embeddingKey("Policy", "Some text.")).toBe(embeddingKey("Policy", "Some text."));
  });

  it("changes when the title or the text changes", () => {
    const key = embeddingKey("Policy", "Some text.");

    expect(embeddingKey("Renamed policy", "Some text.")).not.toBe(key);
    expect(embeddingKey("Policy", "Other text.")).not.toBe(key);
  });

  it("changes when the embedding format version changes", async () => {
    const key = embeddingKey("Policy", "Some text.");

    expect(await keyWith({ EMBEDDING_FORMAT_VERSION: 2 }, "Policy", "Some text.")).not.toBe(key);
  });

  it("changes when the model or its revision changes", async () => {
    const key = embeddingKey("Policy", "Some text.");

    expect(await keyWith({ EMBEDDING_MODEL: "other/model" }, "Policy", "Some text.")).not.toBe(key);
    expect(await keyWith({ EMBEDDING_MODEL_REVISION: "0000000" }, "Policy", "Some text.")).not.toBe(key);
  });
});
