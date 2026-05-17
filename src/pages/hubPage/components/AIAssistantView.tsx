import { useState, useEffect, useRef } from "react";
import "./aiAssistant.scss";
import { BrainCircuit, Send, Bot, ScrollText, X } from "lucide-react";
import { chatWithAI, getSystemPrompt, type PromptConfig } from "../../../api/aiClient";
import type { DocumentItem } from "../../../api/documentsClient";
import { buildSnippet, scoreDoc, uid } from "../utils/assistantUtils";
import { loadJson, saveJson, scopedKey } from "../../../utils/storage";
import type { ChatMessage } from "../assistantTypes";
import { CHAT_KEY } from "../utils/assistantUtils";

export const AI_QUERY_COUNT_BASE_KEY = "aiQueryCount";
import TypewriterText from "./TypewriterText";
import { useAuth } from "../../../auth/useAuth";

const PROMPT_SUGGESTIONS = [
  "What are the main themes across my documents?",
  "Summarize the key decisions and their rationale",
  "What open questions or unresolved issues are mentioned?",
  "What data or metrics are referenced?",
];

type Props = {
  docs: DocumentItem[];
  selectedIds: string[];
  onOpenMobilePicker?: () => void;
};

export default function AIAssistantView({ docs, selectedIds, onOpenMobilePicker }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [promptConfig, setPromptConfig] = useState<PromptConfig | null>(null);
  const [promptModalOpen, setPromptModalOpen] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    loadJson<ChatMessage[]>(CHAT_KEY, [
      {
        id: uid(),
        role: "assistant",
        text: "How can I help you?",
        isTyped: true,
        isGreeting: true,
      },
    ])
  );
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedDocs = selectedIds.length === 0
    ? []
    : docs.filter((d) => selectedIds.includes(d.id));
  const contextDocs = selectedDocs.length > 0 ? selectedDocs : docs;

  const hasStartedChat = messages.length > 1;

  async function sendMessage(text: string) {
    const question = text.trim();
    if (!question) return;

    setLastError(null);
    setMessages((prev) => {
      const isInitial = prev.length === 1 && prev[0].isGreeting;
      const history = isInitial ? [] : prev;
      return [...history, { id: uid(), role: "user", text: question }];
    });
    setInput("");
    setIsSending(true);

    try {
      const ranked = contextDocs
        .map((d) => ({ doc: d, score: scoreDoc(d, question) }))
        .sort((a, b) => b.score - a.score);
      const top = ranked.filter((x) => x.score > 0).slice(0, 3).map((x) => x.doc);

      const response = await chatWithAI(question, top);
      const sources = response.sources.map((s: { id: string; title: string }) => ({
        id: s.id,
        title: s.title,
        snippet: buildSnippet(
          contextDocs.find((d) => d.id === s.id)?.content || "",
          question
        ),
      }));

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
      const key = scopedKey(AI_QUERY_COUNT_BASE_KEY, user?.email);
      saveJson(key, loadJson<number>(key, 0) + 1);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Sorry, I encountered an error.";
      setLastError(errMsg);
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          text: errMsg,
          isTyped: false,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function handleRetry() {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg && typeof lastUserMsg.text === "string") {
      const lastUserIdx = messages.findIndex((m) => m.id === lastUserMsg.id);
      const afterUser = messages.slice(lastUserIdx + 1);
      const lastAssistantIdx = afterUser.findIndex((m) => m.role === "assistant");
      const toRemove = lastAssistantIdx >= 0
        ? [lastUserMsg.id, afterUser[lastAssistantIdx].id]
        : [lastUserMsg.id];
      setMessages((prev) => prev.filter((m) => !toRemove.includes(m.id)));
      sendMessage(lastUserMsg.text);
    }
  }

  function handleSuggestionClick(suggestion: string) {
    setInput(suggestion);
    inputRef.current?.focus();
  }

  function clearChat() {
    setMessages([{
      id: uid(),
      role: "assistant",
      text: "How can I help you?",
      isTyped: true,
      isGreeting: true,
    }]);
    setLastError(null);
  }

  useEffect(() => {
    saveJson(CHAT_KEY, messages);
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  async function openPromptModal() {
    if (!promptConfig) {
      try {
        const config = await getSystemPrompt();
        setPromptConfig(config);
      } catch {
        return;
      }
    }
    setPromptModalOpen(true);
  }

  return (
    <div className="ai-assistant-view">
      {promptModalOpen && promptConfig && (
        <div className="prompt-modal-overlay" onClick={() => setPromptModalOpen(false)}>
          <div className="prompt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="prompt-modal-header">
              <div className="prompt-modal-title">
                <ScrollText size={16} />
                System Prompt
              </div>
              <button
                type="button"
                className="prompt-modal-close"
                onClick={() => setPromptModalOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="prompt-modal-meta">
              <span>{promptConfig.name}</span>
              <span className="prompt-modal-version">v{promptConfig.version}</span>
            </div>
            <p className="prompt-modal-description">{promptConfig.description}</p>
            <pre className="prompt-modal-body">{promptConfig.prompt}</pre>
          </div>
        </div>
      )}

      <div className={`ai-assistant-content ${hasStartedChat ? "has-messages" : ""}`}>
        {!hasStartedChat ? (
          <>
            <div className="ai-hero">
              <div className="ai-hero-icon">
                <BrainCircuit size={64} />
              </div>
              <h1 className="ai-hero-title">Insight Desk AI</h1>
              <p className="ai-hero-subtitle">
                Ask me anything about your documents, or let me help you extract
                insights and summaries.
              </p>
            </div>

            <div className="ai-suggestions">
              {PROMPT_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  className="ai-suggestion-card"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="ai-messages" aria-live="polite">
            {messages.map((m) => {
              if (m.isGreeting) return null;
              const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

              return (
                <div key={m.id} className={`ai-message ${m.role}`}>
                  {m.role === "assistant" && (
                    <div className="ai-avatar">
                      <Bot size={20} />
                    </div>
                  )}
                  <div className="ai-bubble-wrap">
                    <div className="ai-bubble">
                      {m.role === "assistant" &&
                        m.isTyped === false &&
                        typeof m.text === "string" ? (
                        <TypewriterText
                          text={m.text}
                          onComplete={() =>
                            setMessages((prev) =>
                              prev.map((msg) =>
                                msg.id === m.id ? { ...msg, isTyped: true } : msg
                              )
                            )}
                        />
                      ) : (
                        m.text
                      )}
                    </div>
                    {m.role === "assistant" && <div className="ai-message-time">{timeString}</div>}
                  </div>
                </div>
              );
            })}
            {isSending && (
              <div className="ai-message assistant" aria-label="AI is thinking">
                <div className="ai-bubble thinking">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
            {lastError && (
              <button
                type="button"
                className="ai-retry-btn"
                onClick={handleRetry}
              >
                Retry
              </button>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="ai-input-section">
        <div className="ai-composer-container">
          <textarea
            ref={inputRef}
            placeholder="Ask about your documents..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            disabled={isSending}
            rows={1}
          />
          <button
            className="ai-send-btn"
            onClick={() => sendMessage(input)}
            disabled={isSending || !input.trim()}
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        </div>

        <div className="ai-bottom-panel">
          <div className="ai-composer-footer-row">
            {isAdmin && (
              <button
                type="button"
                className="ai-prompt-config-btn"
                onClick={openPromptModal}
                title="View system prompt"
              >
                <ScrollText size={13} />
                System Prompt
              </button>
            )}
            <p className="ai-composer-hint">
              {selectedIds.length === 0
                ? "Using all documents for context"
                : `${selectedIds.length} document${selectedIds.length === 1 ? "" : "s"} in context`}
            </p>
            {onOpenMobilePicker && (
              <button
                type="button"
                className="ai-mobile-context-btn"
                onClick={onOpenMobilePicker}
              >
                {selectedIds.length > 0 ? `Context (${selectedIds.length})` : "Context"}
              </button>
            )}
            {hasStartedChat && (
              <button
                type="button"
                className="ai-clear-chat-btn"
                onClick={clearChat}
              >
                Clear chat
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
