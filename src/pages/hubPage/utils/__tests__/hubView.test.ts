import { describe, it, expect } from "vitest";
import { viewFromParams, paramsForView, type UrlView } from "../hubView";

const parse = (query: string) => viewFromParams(new URLSearchParams(query));

describe("viewFromParams", () => {
  it("defaults to the AI assistant", () => {
    expect(parse("")).toEqual({ kind: "ai" });
  });

  it("reads an open document", () => {
    expect(parse("doc=abc123")).toEqual({ kind: "doc", id: "abc123" });
  });

  it("reads the dashboard and settings views", () => {
    expect(parse("view=dashboard")).toEqual({ kind: "dashboard" });
    expect(parse("view=settings")).toEqual({ kind: "settings" });
  });

  it("falls back to the AI assistant for unknown or empty values", () => {
    expect(parse("view=creating")).toEqual({ kind: "ai" });
    expect(parse("view=admin")).toEqual({ kind: "ai" });
    expect(parse("doc=")).toEqual({ kind: "ai" });
  });
});

describe("paramsForView", () => {
  it("round-trips every view through the URL", () => {
    const views: UrlView[] = [
      { kind: "ai" },
      { kind: "dashboard" },
      { kind: "settings" },
      { kind: "doc", id: "abc123" },
    ];
    for (const view of views) {
      expect(viewFromParams(paramsForView(view))).toEqual(view);
    }
  });

  it("keeps the AI assistant at the bare /hub URL", () => {
    expect(paramsForView({ kind: "ai" }).toString()).toBe("");
  });
});
