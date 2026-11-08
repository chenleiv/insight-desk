import { SlidersHorizontal, X } from "lucide-react";
import { LoadError } from "../../../../../components/loadError/LoadError";

type Props = {
  isOpen: boolean;
  promptText: string | null;
  loadFailed: boolean;
  onRetry: () => void;
  onClose: () => void;
};

export function SystemPromptModal({ isOpen, promptText, loadFailed, onRetry, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="prompt-modal-overlay" onClick={onClose}>
      <div className="prompt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="prompt-modal-header">
          <span className="prompt-modal-title">
            <SlidersHorizontal size={15} />
            System Prompt
          </span>
          <button
            type="button"
            className="prompt-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {loadFailed ? (
          <LoadError message="Could not load the system prompt." onRetry={onRetry} />
        ) : (
          <pre className="prompt-modal-body">
            {promptText ?? "Loading…"}
          </pre>
        )}
      </div>
    </div>
  );
}
