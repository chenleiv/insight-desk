import { use } from "react";
import { ConfirmContext } from "../components/confirmModal/confirmContext";

export default function useConfirm() {
  const ctx = use(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
