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

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const base = getApiBase();
  const url = `${base}${path}`;

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  if (init.body && !headers.has("Content-Type")) {
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
    let message = `Request failed: ${res.status}`;
    try {
      const body = JSON.parse(text);
      if (body?.detail) message = body.detail;
    } catch { /* non-JSON error body */ }
    throw new ApiError(message, res.status, text || undefined);
  }

  return (text ? JSON.parse(text) : null) as T;
}
