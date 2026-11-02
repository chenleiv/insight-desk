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
  // When the message was sent, in milliseconds. Messages saved without it show no time.
  sentAt?: number;
  isTyped?: boolean;
  isGreeting?: boolean;
  // Set on assistant answers the user can rate.
  answerId?: string;
  feedback?: FeedbackRating | undefined;
};
