import React, { useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import {
  ConfirmContext,
  type ConfirmOptions,
  type ConfirmFn,
} from "./confirmContext";

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({
    title: "Are you sure?",
    message: "",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    variant: "danger",
  });

  const confirm: ConfirmFn = (opts) => {
    setOptions({
      title: opts.title ?? "Are you sure?",
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? "Confirm",
      cancelLabel: opts.cancelLabel ?? "Cancel",
      variant: opts.variant ?? "danger",
    });

    setOpen(true);

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  };

  function close(result: boolean) {
    setOpen(false);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(result);
  }

  const value = confirm;

  const title = options.title ?? "Are you sure?";
  const confirmLabel = options.confirmLabel ?? "Confirm";
  const cancelLabel = options.cancelLabel ?? "Cancel";
  const variant = options.variant ?? "primary";
  return (
    <ConfirmContext value={value}>
      {children}
      <ConfirmDialog
        open={open}
        title={title}
        message={options.message}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        variant={variant}
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />
    </ConfirmContext>
  );
}
