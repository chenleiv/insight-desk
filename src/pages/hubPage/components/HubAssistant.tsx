import { useEffect, useState } from "react";
import {
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  X,
} from "lucide-react";
import { useDocuments } from "../../../context/DocumentsContext";
import { chatWithAI } from "../../../api/aiClient";
import type { ChatMessage, SourceRef } from "../assistantTypes";
import { CHAT_KEY, buildSnippet, scoreDoc, uid } from "../utils/assistantUtils";
import { loadJson, saveJson } from "../../../utils/storage";
import MessagesList from "./MessagesList";
import Composer from "./Composer";
import { type DocumentItem } from "../../../api/documentsClient";

type Props = {
  selectedIds: number[];
  onSelectDocuments?: () => void;
  onToggleSelected?: (id: number) => void;
  onClearSelection?: () => void;
  isMinimized?: boolean;
  isMaximized?: boolean;
  isMobile?: boolean;
  onToggleMaximize?: () => void;
  onMinimize?: () => void;
  onExpand?: () => void;
};

export default function HubAssistant({
  selectedIds,
  onSelectDocuments,
  onToggleSelected,
  onClearSelection,
  isMinimized,
  isMaximized,
  isMobile,
  onToggleMaximize,
  onMinimize,
  onExpand,
}: Props) {
  const { docs } = useDocuments();
  const GREETING_TEXT = "How can I help you?";

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    loadJson<ChatMessage[]>(CHAT_KEY, [
      {
        id: uid(),
        role: "assistant",
        text: GREETING_TEXT,
        isTyped: true,
        isGreeting: true,
      },
    ]),
  );

  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    saveJson(CHAT_KEY, messages);
  }, [messages]);

  const selectedDocs = (() => {
    if (selectedIds.length === 0) return [];
    const set = new Set(selectedIds);
    return docs.filter((d: DocumentItem) => set.has(d.id));
  })();

  function clearChat() {
    setMessages([
      {
        id: uid(),
        role: "assistant",
        text: GREETING_TEXT,
        isTyped: true,
        isGreeting: true,
      },
    ]);
  }

  async function send() {
    const question = input.trim();
    if (!question) return;

    setMessages((prev) => {
      const isInitial = prev.length === 1 && prev[0].isGreeting;
      const history = isInitial ? [] : prev;
      return [...history, { id: uid(), role: "user", text: question }];
    });
    setInput("");
    setIsSending(true);

    try {
      const contextDocs = selectedDocs.length > 0 ? selectedDocs : docs;
      const ranked = contextDocs
        .map((d: DocumentItem) => ({ doc: d, score: scoreDoc(d, question) }))
        .sort((a, b) => b.score - a.score);

      const top = ranked
        .filter((x) => x.score > 0)
        .slice(0, 3)
        .map((x) => x.doc);

      const response = await chatWithAI(question, top);

      const sources: SourceRef[] = response.sources.map(
        (s: { id: number; title: string }) => ({
          id: s.id,
          title: s.title,
          snippet: buildSnippet(
            contextDocs.find((d: DocumentItem) => d.id === s.id)?.content || "",
            question,
          ),
        }),
      );

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          text: response.answer,
          sources,
          isTyped: false,
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          text:
            e instanceof Error
              ? e.message
              : "Sorry, I encountered an error connecting to the AI service.",
          isTyped: false,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function handleTypingComplete(id: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isTyped: true } : m)),
    );
  }

  if (isMinimized) {
    return (
      <div
        className="hub-assistant-minimized demo-rail-target"
        onClick={onExpand || onToggleMaximize}
        data-tooltip="Expand AI Hub"
        data-tooltip-pos="left"
      >
        <button
          className="icon-btn expand-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (onExpand) onExpand();
            else if (onToggleMaximize) onToggleMaximize();
          }}
        >
          <PanelRightOpen size={16} />
        </button>
        <div className="assistant-rotated-title">
          <p>AI HUB</p>
        </div>
      </div>
    );
  }

  return (
    <div className="hub-assistant">
      <div className="assistant-topbar">
        <div className="topbar-left">
          <h2 className="topbar-title">AI Hub</h2>
        </div>
        <div className="topbar-right" style={{ display: "flex", gap: "4px" }}>
          {isMobile ? (
            onMinimize && (
              <button
                className="icon-btn"
                onClick={onMinimize}
                data-tooltip="Close AI Hub"
                data-tooltip-pos="bottom"
              >
                <X size={16} />
              </button>
            )
          ) : (
            <>
              {onMinimize && (
                <button
                  className="icon-btn demo-rail-target"
                  onClick={onMinimize}
                  data-tooltip="Collapse to Rail"
                  data-tooltip-pos="bottom"
                >
                  <PanelRightClose size={16} />
                </button>
              )}
              {onToggleMaximize && (
                <button
                  className="icon-btn"
                  onClick={onToggleMaximize}
                  data-tooltip={
                    isMaximized ? "Restore Layout" : "Maximize Assistant"
                  }
                  data-tooltip-pos="bottom"
                >
                  {isMaximized ? (
                    <Minimize2 size={16} />
                  ) : (
                    <Maximize2 size={16} />
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <MessagesList
        messages={messages}
        isThinking={isSending}
        onTypingComplete={handleTypingComplete}
        onSelectDocuments={() => onSelectDocuments?.()}
      />

      <Composer
        value={input}
        disabled={isSending}
        onChange={setInput}
        onSend={send}
        docs={docs}
        selectedDocs={selectedDocs}
        onClearChat={clearChat}
        canClearChat={messages.length > 1}
        {...(onToggleSelected ? { onToggleSelected } : {})}
        {...(onClearSelection ? { onClearSelection } : {})}
      />
    </div>
  );
}
