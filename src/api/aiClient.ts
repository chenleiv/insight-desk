import { apiFetch } from "./base";

export interface ChatResponse {
  answer: string;
  // Every document retrieved for the question; empty when nothing was similar enough.
  sources: { id: string; title: string }[];
  // Chunks the answer cites, checked on the server against the retrieved set.
  citations: { id: string; docId: string; title: string; index: number }[];
}

// Only the question is sent; the server searches the user's documents for the context.
export async function chatWithAI(message: string): Promise<ChatResponse> {
  return await apiFetch<ChatResponse>("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
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

export async function getSuggestions(): Promise<{ questions: string[] }> {
  return await apiFetch<{ questions: string[] }>("/api/ai/suggestions");
}

export async function updateSuggestions(questions: string[]): Promise<{ questions: string[] }> {
  return await apiFetch<{ questions: string[] }>("/api/ai/suggestions", {
    method: "PATCH",
    body: JSON.stringify({ questions }),
  });
}
