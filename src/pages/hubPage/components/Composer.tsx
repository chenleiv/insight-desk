import { useEffect, useRef, useState, useMemo } from "react";
import type { DocumentItem } from "../../../api/documentsClient";
import { X, FileText, Trash2 } from "lucide-react";

type Props = {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  docs?: DocumentItem[];
  selectedDocs?: DocumentItem[];
  onToggleSelected?: (id: number) => void;
  onClearSelection?: () => void;
  onClearChat?: () => void;
  canClearChat?: boolean;
};

export default function Composer({
  value,
  disabled,
  onChange,
  onSend,
  docs = [],
  selectedDocs = [],
  onToggleSelected,
  onClearSelection,
  onClearChat,
  canClearChat,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setShowMentionMenu(false);
      }
    }

    if (showMentionMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showMentionMenu]);

  const filteredDocs = useMemo(() => {
    if (!mentionQuery) return docs;
    const lower = mentionQuery.toLowerCase();
    return docs.filter((d) => d.title.toLowerCase().includes(lower));
  }, [docs, mentionQuery]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    const lastAtPos = val.lastIndexOf("@");
    if (lastAtPos !== -1) {
      const textAfterAt = val.slice(lastAtPos + 1);
      if (!textAfterAt.includes(" ")) {
        setShowMentionMenu(true);
        setMentionQuery(textAfterAt);
        setActiveIndex(0);
        return;
      }
    }
    setShowMentionMenu(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showMentionMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, filteredDocs.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && filteredDocs.length > 0) {
        e.preventDefault();
        selectDoc(filteredDocs[activeIndex]);
      } else if (e.key === "Escape") {
        setShowMentionMenu(false);
      }
      return;
    }

    if (e.key === "Enter") {
      onSend();
    }
  };

  const selectDoc = (doc: DocumentItem) => {
    if (onToggleSelected && !selectedDocs.find((d) => d.id === doc.id)) {
      onToggleSelected(doc.id);
    }
    setShowMentionMenu(false);

    // Remove the '@query' from the input text
    const lastAtPos = value.lastIndexOf("@");
    if (lastAtPos !== -1) {
      const newVal = value.slice(0, lastAtPos).trim();
      onChange(newVal + (newVal.length > 0 ? " " : ""));
    }

    // Maintain focus
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div className="composer-wrapper" ref={wrapperRef}>
      {selectedDocs.length > 0 && (
        <div className="composer-context-pills">
          {selectedDocs.map((doc) => (
            <div key={doc.id} className="context-pill">
              <span className="pill-text">{doc.title}</span>
              {onToggleSelected && (
                <button
                  type="button"
                  className="remove-pill"
                  onClick={() => onToggleSelected(doc.id)}
                  data-tooltip="Remove"
                  data-tooltip-pos="bottom"
                  aria-label="Remove document from context"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
          {onClearSelection && selectedDocs.length > 1 && (
            <button
              type="button"
              className="clear-pills-btn"
              onClick={onClearSelection}
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {showMentionMenu && filteredDocs.length > 0 && (
        <div className="mention-menu">
          <div className="mention-header">Add context document</div>
          <div className="mention-list">
            {filteredDocs.map((doc, idx) => (
              <button
                key={doc.id}
                type="button"
                className={`mention-item ${idx === activeIndex ? "active" : ""}`}
                onClick={() => selectDoc(doc)}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                <FileText size={14} className="mention-icon" />
                <span className="mention-title">{doc.title}</span>
                {selectedDocs.find((d) => d.id === doc.id) && (
                  <span className="mention-added">Added</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="composer">
        {onClearChat && (
          <button
            type="button"
            className="clear-chat-btn"
            onClick={onClearChat}
            disabled={!canClearChat}
            data-tooltip="Clear Chat"
            data-tooltip-pos="top"
            style={{ opacity: !canClearChat ? 0.3 : 1 }}
          >
            <Trash2 size={18} />
          </button>
        )}
        <input
          ref={inputRef}
          value={value}
          onChange={handleInputChange}
          placeholder="Ask something... (Type @ to add context)"
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <button
          type="button"
          className="send-btn"
          onClick={onSend}
          disabled={disabled || value.trim() === ""}
        >
          {disabled ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}
