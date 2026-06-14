import { use } from "react";
import { StatusContext } from "./statusContext";

export function useStatus() {
  const ctx = use(StatusContext);
  if (!ctx) throw new Error("useStatus must be used within StatusProvider");
  return ctx;
}
