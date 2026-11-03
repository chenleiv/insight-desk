const DEFAULT_PATH = "/hub";

// One leading slash, then no second slash or backslash that a browser could read as another host.
// URL parsers also drop tabs and newlines, so those could hide the same trick.
const IN_APP_PATH = /^\/(?![/\\])[^\\\p{Cc}]*$/u;

type ReturnLocation = { pathname?: unknown; search?: unknown; hash?: unknown };

/** Where to go after sign-in: the page that asked for it if it is inside the app, else the default. */
export function safeReturnPath(from: ReturnLocation | null | undefined): string {
  const { pathname, search = "", hash = "" } = from ?? {};
  if (typeof pathname !== "string" || typeof search !== "string" || typeof hash !== "string") {
    return DEFAULT_PATH;
  }
  const path = `${pathname}${search}${hash}`;
  return IN_APP_PATH.test(path) ? path : DEFAULT_PATH;
}
