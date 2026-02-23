export type Role = "user" | "assistant";

export type SourceRef = {
  id: number;
  title: string;
  snippet: string;
};

export type ChatMessage = {
  id: string;
  role: Role;
  text: string;
  sources?: SourceRef[];
  isTyped?: boolean;
  isGreeting?: boolean;
};
