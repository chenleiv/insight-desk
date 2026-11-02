import type { SourceRef } from "../assistantTypes";

type Props = {
  source: SourceRef;
  // Absent on answers saved before citations were numbered.
  number?: number;
  available: boolean;
  disabled: boolean;
  onOpen: (id: string) => void;
};

/** A cited document. An unavailable one stays focusable, and a click says why it does not open. */
export function SourceChip({ source, number, available, disabled, onOpen }: Props) {
  const label = number === undefined ? "source" : `source ${number}`;
  return (
    <button
      type="button"
      title={source.title}
      disabled={disabled}
      aria-disabled={available ? undefined : true}
      aria-label={available
        ? `Open ${label}: ${source.title}`
        : `${label[0].toUpperCase()}${label.slice(1)}: ${source.title}, no longer available`}
      onClick={() => onOpen(source.id)}
    >
      {number !== undefined && <span dir="ltr">[{number}]</span>}
      <span className="ai-source-title" dir="auto">{source.title}</span>
    </button>
  );
}
