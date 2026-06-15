import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { StatusMessage } from "./statusTypes";
import { StatusContext, type StatusApi } from "./statusContext";
import StatusBar from "./StatusBar";

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function StatusProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<StatusMessage | null>(null);
  const timerRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    setMsg(null);
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback((next: Omit<StatusMessage, "id">) => {
    clear();
    const full: StatusMessage = {
      id: uid(),
      timeoutMs: next.kind === "error" ? 20000 : 1000,
      ...next,
    };
    setMsg(full);
    if ((full.timeoutMs ?? 0) > 0) {
      timerRef.current = window.setTimeout(() => clear(), full.timeoutMs);
    }
  }, [clear]);

  const api = useMemo<StatusApi>(() => ({ show, clear }), [show, clear]);

  return (
    <StatusContext value={api}>
      {children}
      <StatusBar message={msg} onClose={clear} />
    </StatusContext>
  );
}
