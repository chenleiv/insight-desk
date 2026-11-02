import type { SourceRef } from "../assistantTypes";

type Props = {
  source: SourceRef;
  available: boolean;
  disabled: boolean;
  onOpen: (id: string) => void;
};

/** A cited document. An unavailable one stays focusable, and a click says why it does not open. */
export function SourceChip({ source, available, disabled, onOpen }: Props) {
  return (
    <button
      type="button"
      title={source.title}
      disabled={disabled}
      aria-disabled={available ? undefined : true}
      aria-label={available
        ? `Open source: ${source.title}`
        : `Source: ${source.title}, no longer available`}
      onClick={() => onOpen(source.id)}
    >
      <span className="ai-source-title" dir="auto">{source.title}</span>
    </button>
  );
}
