type Role = "user" | "assistant";

type SourceRef = {
  id: string;
  title: string;
};

export type ChatMessage = {
  id: string;
  role: Role;
  text: string;
  sources?: SourceRef[];
  isTyped?: boolean;
  isGreeting?: boolean;
};
