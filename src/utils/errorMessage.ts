import { ApiError } from "../api/base";

// The client's own wording when the server's error had no detail.
const NO_SERVER_DETAIL = /^(Request|Download) failed: \d+$/;

type Options = {
  /** For a route whose 5xx details are written for users, such as chat. */
  keepServerErrors?: boolean;
};

/**
 * What to tell the user about a failed action. A 4xx detail and an Error our own code
 * threw are written for users and pass through. A network or runtime error ("Failed to
 * fetch") and a 5xx ("Internal server error") are not, so they become the fallback.
 */
export function friendlyError(err: unknown, fallback: string, { keepServerErrors = false }: Options = {}): string {
  if (err instanceof ApiError) {
    if (NO_SERVER_DETAIL.test(err.message)) return fallback;
    return err.status >= 500 && !keepServerErrors ? fallback : err.message;
  }
  // Browser and runtime errors are subclasses, such as TypeError or SyntaxError.
  return err instanceof Error && err.name === "Error" ? err.message : fallback;
}
