// @vitest-environment node
import { describe, it, expect } from "vitest";
import { canAccessDocument, canEditDocuments, documentScope } from "../access.js";

const admin = { _id: "admin-1", role: "admin" };
const viewer = { _id: "viewer-1", role: "viewer" };
const demo = { _id: "demo-1", role: "demo" };

const realDoc = { _id: "d1", ownerId: "admin-1", demo: false };
const ownDemoDoc = { _id: "d2", ownerId: "demo-1", demo: true };
const otherDemoDoc = { _id: "d3", ownerId: "demo-2", demo: true };

describe("access rules", () => {
  it("lets admins and demo users edit, not viewers", () => {
    expect(canEditDocuments(admin)).toBe(true);
    expect(canEditDocuments(demo)).toBe(true);
    expect(canEditDocuments(viewer)).toBe(false);
  });

  it("scopes demo users to their own documents and everyone else to non-demo ones", () => {
    expect(documentScope(demo)).toEqual({ ownerId: "demo-1" });
    expect(documentScope(admin)).toEqual({ demo: { $ne: true } });
    expect(documentScope(viewer)).toEqual({ demo: { $ne: true } });
  });

  it("gives demo users only their own documents", () => {
    expect(canAccessDocument(demo, ownDemoDoc)).toBe(true);
    expect(canAccessDocument(demo, realDoc)).toBe(false);
    expect(canAccessDocument(demo, otherDemoDoc)).toBe(false);
  });

  it("hides demo documents from regular users", () => {
    expect(canAccessDocument(admin, realDoc)).toBe(true);
    expect(canAccessDocument(viewer, realDoc)).toBe(true);
    expect(canAccessDocument(admin, ownDemoDoc)).toBe(false);
  });

  it("denies a missing document", () => {
    expect(canAccessDocument(admin, null)).toBe(false);
  });
});
