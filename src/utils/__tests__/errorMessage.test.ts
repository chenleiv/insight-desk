import { describe, it, expect } from "vitest";
import { ApiError } from "../../api/base";
import { friendlyError } from "../errorMessage";

const FALLBACK = "Could not do it. Check your connection and try again.";

describe("friendlyError", () => {
  it.each([
    ["a network failure", new TypeError("Failed to fetch")],
    ["a non-JSON success body", new SyntaxError("Unexpected token <")],
    ["an aborted request", new DOMException("Aborted", "AbortError")],
    ["a 500 detail", new ApiError("Internal server error", 500)],
    ["a 503 detail", new ApiError("Error deleting user", 503)],
    ["a status with no detail", new ApiError("Request failed: 404", 404)],
    ["a download with no detail", new ApiError("Download failed: 413", 413)],
    ["a non-error value", "boom"],
    ["nothing", null],
  ])("uses the fallback for %s", (_name, err) => {
    expect(friendlyError(err, FALLBACK)).toBe(FALLBACK);
  });

  it.each([
    ["a 401 detail", new ApiError("Invalid credentials", 401), "Invalid credentials"],
    ["a 413 detail", new ApiError("File is too large", 413), "File is too large"],
    ["an error from our own code", new Error('"a.md" is too large (max 5MB)'), '"a.md" is too large (max 5MB)'],
  ])("keeps %s", (_name, err, expected) => {
    expect(friendlyError(err, FALLBACK)).toBe(expected);
  });

  it("keeps a 5xx detail when asked to", () => {
    const busy = new ApiError("The AI service is busy right now.", 503);
    expect(friendlyError(busy, FALLBACK, { keepServerErrors: true })).toBe("The AI service is busy right now.");
  });

  it("still replaces missing details and network failures when keeping server errors", () => {
    const options = { keepServerErrors: true };
    expect(friendlyError(new ApiError("Request failed: 502", 502), FALLBACK, options)).toBe(FALLBACK);
    expect(friendlyError(new TypeError("Failed to fetch"), FALLBACK, options)).toBe(FALLBACK);
  });
});
