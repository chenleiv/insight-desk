import { apiFetch } from "./base";

export interface ChatResponse {
  answer: string;
  sources: { id: string; title: string }[];
}

// The server picks the relevant passages; docIds only narrows the search to selected documents.
export async function chatWithAI(message: string, docIds: string[]): Promise<ChatResponse> {
  return await apiFetch<ChatResponse>("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({ message, docIds }),
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
