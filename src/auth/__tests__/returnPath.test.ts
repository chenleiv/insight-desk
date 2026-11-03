import { describe, it, expect } from "vitest";
import { safeReturnPath } from "../returnPath";

describe("safeReturnPath", () => {
  it("keeps the query and hash of a path inside the app", () => {
    expect(safeReturnPath({ pathname: "/hub", search: "?doc=abc123", hash: "#top" })).toBe("/hub?doc=abc123#top");
    expect(safeReturnPath({ pathname: "/users", search: "", hash: "" })).toBe("/users");
    expect(safeReturnPath({ pathname: "/hub", search: "?next=//example.com" })).toBe("/hub?next=//example.com");
  });

  it.each([
    ["a missing location", null],
    ["no state", undefined],
    ["no pathname", {}],
    ["a non-string pathname", { pathname: 42 }],
    ["a non-string query", { pathname: "/hub", search: 42 }],
    ["an empty path", { pathname: "" }],
    ["a full URL", { pathname: "https://example.com/hub" }],
    ["another scheme", { pathname: "javascript:alert(1)" }],
    ["a relative path", { pathname: "hub" }],
    ["a protocol-relative URL", { pathname: "//example.com" }],
    ["a backslash after the slash", { pathname: "/\\example.com" }],
    ["two backslashes", { pathname: "\\\\example.com" }],
    ["a backslash later in the path", { pathname: "/hub\\..\\..\\example.com" }],
    ["a tab hiding a second slash", { pathname: "/\t/example.com" }],
    ["a newline hiding a second slash", { pathname: "/\n/example.com" }],
    ["a backslash in the query", { pathname: "/hub", search: "?a=\\b" }],
  ])("falls back to the default page for %s", (_label, from) => {
    expect(safeReturnPath(from)).toBe("/hub");
  });
});
