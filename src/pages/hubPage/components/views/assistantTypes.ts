import type { FeedbackRating } from "../../../../api/aiClient";

type Role = "user" | "assistant";

export type SourceRef = {
  id: string;
  title: string;
};

export type ChatMessage = {
  id: string;
  role: Role;
  text: string;
  sources?: SourceRef[];
  // Set when the text holds numbered citation markers. Answers saved without it show document titles.
  citationStyle?: "numbered";
  // When the message was sent, in milliseconds. Messages saved without it show no time.
  sentAt?: number;
  isTyped?: boolean;
  isGreeting?: boolean;
  // Set on assistant answers the user can rate.
  answerId?: string;
  feedback?: FeedbackRating | undefined;
};
