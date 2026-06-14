type StatusKind = "success" | "error" | "info";

export type StatusMessage = {
  id: string;
  kind: StatusKind;
  title?: string;
  message: string;
  timeoutMs?: number;
  actionLabel?: string;
  onAction?: () => void;
};
