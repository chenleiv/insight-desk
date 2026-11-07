import { ApiError, apiFetch } from "./base";

export interface ChatResponse {
  answer: string;
  // Chunks the answer cites, checked on the server against the retrieved set.
  citations: { id: string; docId: string; title: string; index: number }[];
  // Identifies the answer for feedback; null when the server could not record it.
  answerId: string | null;
}

// Only the question is sent; the server searches the user's documents for the context.
export async function chatWithAI(message: string): Promise<ChatResponse> {
  return await apiFetch<ChatResponse>("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

// The message to show when the server refused a question for a daily limit, with the local
// time the limit resets. Null for any other error, which the user may simply retry.
export function dailyLimitMessage(error: unknown, now = new Date()): string | null {
  if (!(error instanceof ApiError) || !error.bodyText) return null;
  let body: { detail?: unknown; code?: unknown; retryAfter?: unknown };
  try {
    body = JSON.parse(error.bodyText);
  } catch {
    return null;
  }
  if (body?.code !== "daily_limit" || typeof body.detail !== "string") return null;
  if (typeof body.retryAfter !== "number" || !Number.isFinite(body.retryAfter)) return body.detail;
  const resetsAt = new Date(now.getTime() + body.retryAfter * 1000);
  const time = resetsAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${body.detail} It resets at ${time}.`;
}

export type FeedbackRating = "up" | "down";

// A rating of one of the user's own answers; a new rating replaces the previous one.
export async function sendFeedback(answerId: string, rating: FeedbackRating): Promise<void> {
  await apiFetch("/api/ai/feedback", {
    method: "POST",
    body: JSON.stringify({ answerId, rating }),
  });
}

export interface PromptConfig {
  prompt: string;
  name: string;
  version: string;
  description: string;
}

export async function getSystemPrompt(): Promise<PromptConfig> {
  return await apiFetch<PromptConfig>("/api/ai/prompt");
}

export async function updateSystemPrompt(prompt: string): Promise<PromptConfig> {
  return await apiFetch<PromptConfig>("/api/ai/prompt", {
    method: "PATCH",
    body: JSON.stringify({ prompt }),
  });
}

/** Deletes the saved prompt, so the server uses its default; returns that default. */
export async function resetSystemPrompt(): Promise<PromptConfig> {
  return await apiFetch<PromptConfig>("/api/ai/prompt", { method: "DELETE" });
}

export async function getSuggestions(signal?: AbortSignal): Promise<{ questions: string[] }> {
  return await apiFetch<{ questions: string[] }>("/api/ai/suggestions", signal ? { signal } : {});
}

export async function updateSuggestions(questions: string[]): Promise<{ questions: string[] }> {
  return await apiFetch<{ questions: string[] }>("/api/ai/suggestions", {
    method: "PATCH",
    body: JSON.stringify({ questions }),
  });
}

export type QualityDays = 7 | 30;

export interface FeedbackCounts {
  answers: number;
  rated: number;
  up: number;
  down: number;
}

// Aggregate answer-quality metrics for the last `days` days; admin only.
export interface QualitySummary {
  days: QualityDays;
  questions: number;
  noInfo: number;
  // Questions that retrieved no chunk at all, so they have no top score.
  noResults: number;
  meanTopScore: number | null;
  buckets: { label: string; count: number }[];
  feedback: { regular: FeedbackCounts; noInfo: FeedbackCounts; all: FeedbackCounts };
}

export async function getQualitySummary(days: QualityDays, signal?: AbortSignal): Promise<QualitySummary> {
  return await apiFetch<QualitySummary>(`/api/ai/quality?days=${days}`, signal ? { signal } : {});
}
