import type { FeedbackRating } from "../../../../api/aiClient";

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
  // Set on assistant answers the user can rate.
  answerId?: string;
  feedback?: FeedbackRating | undefined;
};
