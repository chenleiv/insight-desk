import { createContext } from "react";
import type { StatusMessage } from "./statusTypes";

export type StatusApi = {
  show: (msg: Omit<StatusMessage, "id">) => void;
  clear: () => void;
};

export const StatusContext = createContext<StatusApi | null>(null);
