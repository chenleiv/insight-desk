import { getApiBase } from "./config";

export class ApiError extends Error {
  status: number;
  bodyText: string | undefined;

  constructor(message: string, status: number, bodyText?: string) {
    super(message);
    this.status = status;
    this.bodyText = bodyText;
  }
}

// A 401 from these is part of signing in or checking for a session, not an expired session.
const SESSION_EXEMPT_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/demo",
  "/api/auth/me",
  "/api/auth/logout",
]);

let unauthorizedHandler: (() => void) | null = null;
/** Raised at each sign-in, so a late 401 to a request of the previous session does not end the new one. */
let sessionGeneration = 0;

export function startSessionGeneration() {
  sessionGeneration += 1;
}

/** Registers the callback that ends the session when a signed-in request gets 401. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export function notifyIfUnauthorized(path: string, status: number) {
  if (status !== 401) return;
  if (SESSION_EXEMPT_PATHS.has(path.split("?")[0])) return;
  unauthorizedHandler?.();
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const base = getApiBase();
  const url = `${base}${path}`;
  const sentInGeneration = sessionGeneration;

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: "include", // ✅ cookies
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();

  if (!res.ok) {
    if (sentInGeneration === sessionGeneration) notifyIfUnauthorized(path, res.status);
    let message = `Request failed: ${res.status}`;
    try {
      const body = JSON.parse(text);
      if (body?.detail) message = body.detail;
    } catch { /* non-JSON error body */ }
    throw new ApiError(message, res.status, text || undefined);
  }

  return (text ? JSON.parse(text) : null) as T;
}
