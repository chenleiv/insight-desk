import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { StatusMessage } from "./statusTypes";
import { StatusContext, type StatusApi } from "./statusContext";
import StatusBar from "./StatusBar";

const DEFAULT_TIMEOUT_MS: Record<StatusMessage["kind"], number> = {
  error: 10000,
  success: 4000,
  info: 4000,
};

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function StatusProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<StatusMessage | null>(null);

  const clear = useCallback(() => setMsg(null), []);

  const show = useCallback((next: Omit<StatusMessage, "id">) => {
    setMsg({
      id: uid(),
      timeoutMs: DEFAULT_TIMEOUT_MS[next.kind],
      ...next,
    });
  }, []);

  const api = useMemo<StatusApi>(() => ({ show, clear }), [show, clear]);

  return (
    <StatusContext value={api}>
      {children}
      <StatusBar message={msg} onClose={clear} />
    </StatusContext>
  );
}
