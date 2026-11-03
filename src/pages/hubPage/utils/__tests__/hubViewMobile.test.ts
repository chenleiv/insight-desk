import { describe, it, expect } from "vitest";
import { viewFromParams, paramsForView, type UrlView } from "../hubView";

describe("phone views in the URL", () => {
  it("reads the documents list and the new-document form", () => {
    expect(viewFromParams(new URLSearchParams("view=documents"))).toEqual({ kind: "documents" });
    expect(viewFromParams(new URLSearchParams("view=new"))).toEqual({ kind: "new" });
  });

  it("round-trips them", () => {
    const views: UrlView[] = [{ kind: "documents" }, { kind: "new" }];
    for (const view of views) {
      expect(viewFromParams(paramsForView(view))).toEqual(view);
    }
  });

  it("still prefers an open document", () => {
    expect(viewFromParams(new URLSearchParams("doc=abc&view=documents"))).toEqual({ kind: "doc", id: "abc" });
  });
});
