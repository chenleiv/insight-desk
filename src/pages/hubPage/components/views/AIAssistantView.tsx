import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import "./aiAssistant.scss";
import { BrainCircuit, Send, Bot, ChevronDown, SlidersHorizontal, ThumbsUp, ThumbsDown } from "lucide-react";
import { chatWithAI, getSuggestions, getSystemPrompt, sendFeedback, type FeedbackRating } from "../../../../api/aiClient";
import { citedSources, formatCitations, formatMessageTime, uid } from "../../utils/assistantUtils";
import { renderMarkdown } from "../../utils/renderMarkdown";
import { CHAT_KEY } from "../../../../storageKeys";
import { loadJson, saveJson, scopedKey } from "../../../../utils/storage";
import type { ChatMessage } from "./assistantTypes";
import TypewriterText from "../layout/TypewriterText";
import { useAuth } from "../../../../auth/useAuth";
import { useDocuments } from "../../../../context/DocumentsContext";
import { useStatus } from "../../../../components/statusBar/useStatus";
import { SystemPromptModal } from "./ai/SystemPromptModal";
import { SourceChip } from "./ai/SourceChip";

export const AI_QUERY_COUNT_BASE_KEY = "aiQueryCount";

const DEFAULT_SUGGESTIONS = [
  "security issue related to this topic",
  "Summarize the key decisions and their rationale",
  "What are the most common mistakes people make in this area?",
  "What is the most important rules from this topic?",
];

type Props = {
  onOpenDocument: (id: string) => void;
};

export default function AIAssistantView({ onOpenDocument }: Props) {
  const { user } = useAuth();
  const status = useStatus();
  const { docs, loading: docsLoading, error: docsError } = useDocuments();
  const docIds = useMemo(() => new Set(docs.map((d) => d.id)), [docs]);
  // The documents this user may read. While the list is unknown, a chip is not marked as gone.
  const isSourceAvailable = (id: string) => docsLoading || !!docsError || docIds.has(id);

  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);

  useEffect(() => {
    getSuggestions()
      .then((r) => { if (r.questions.length) setSuggestions(r.questions); })
      .catch(() => {});
  }, []);

  // The view unmounts when a document opens, so a saved answer is shown whole, not typed again.
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    loadJson<ChatMessage[]>(CHAT_KEY, [
      {
        id: uid(),
        role: "assistant",
        text: "How can I help you?",
        isTyped: true,
        isGreeting: true,
      },
    ]).map((m) => (m.isTyped === false ? { ...m, isTyped: true } : m))
  );
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [promptText, setPromptText] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!promptModalOpen || promptText !== null) return;
    getSystemPrompt()
      .then((r) => setPromptText(r.prompt))
      .catch(() => setPromptText("Failed to load prompt."));
  }, [promptModalOpen, promptText]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const hasStartedChat = messages.some(m => m.role === "user") || isSending;

  async function sendMessage(text: string) {
    const question = text.trim();
    if (!question) return;

    setLastError(null);
    setMessages((prev) => {
      const isInitial = prev.length === 1 && prev[0].isGreeting;
      const history = isInitial ? [] : prev;
      return [...history, { id: uid(), role: "user", text: question, sentAt: Date.now() }];
    });
    setInput("");
    setIsSending(true);

    try {
      const response = await chatWithAI(question);

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          text: formatCitations(response.answer, response.citations),
          // Only documents the answer actually cites, as checked by the server.
          sources: citedSources(response.citations),
          citationStyle: "numbered",
          sentAt: Date.now(),
          isTyped: false,
          ...(response.answerId && { answerId: response.answerId }),
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
          sentAt: Date.now(),
          isTyped: false,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function rateAnswer(m: ChatMessage, rating: FeedbackRating) {
    if (!m.answerId || m.feedback === rating) return;
    const setFeedback = (feedback?: FeedbackRating) =>
      setMessages((prev) => prev.map((msg) => (msg.id === m.id ? { ...msg, feedback } : msg)));

    // Show the choice at once, and undo it if the server did not save it.
    setFeedback(rating);
    try {
      await sendFeedback(m.answerId, rating);
    } catch {
      setFeedback(m.feedback);
    }
  }

  function openSource(id: string) {
    if (docsError) {
      status.show({ kind: "error", message: "Documents could not be loaded. Please try again." });
    } else if (!isSourceAvailable(id)) {
      status.show({ kind: "info", message: "This document is no longer available." });
    } else {
      onOpenDocument(id);
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

  // Coming back from a document, the chat opens at its latest message, not at the top.
  useLayoutEffect(() => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 200) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setShowScrollBtn(false);
    }
  }, [messages, isSending]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 120);
  }, []);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="ai-assistant-view">
      <div className={`ai-assistant-content ${hasStartedChat ? "has-messages" : ""}`}>
        {!hasStartedChat ? (
          <>
            <div className="ai-hero">
              <div className="ai-hero-icon">
                <BrainCircuit size={64} />
              </div>
              <h1 className="ai-hero-title">Brainy AI</h1>
              <p className="ai-hero-subtitle">
                Ask me anything about your documents, or let me help you extract
                insights and summaries.
              </p>
            </div>

            <div className="ai-suggestions">
              {suggestions.map((suggestion) => (
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
          <div className="ai-messages" aria-live="polite" ref={messagesContainerRef} onScroll={handleMessagesScroll}>
            {messages.map((m) => {
              if (m.isGreeting) return null;
              const timeString = formatMessageTime(m.sentAt);

              return (
                <div key={m.id} className={`ai-message ${m.role}`}>
                  {m.role === "assistant" && (
                    <div className="ai-avatar">
                      <Bot size={20} />
                    </div>
                  )}
                  <div className="ai-bubble-wrap">
                    <div className="ai-bubble" dir="auto">
                      {m.role === "assistant" &&
                        m.isTyped === false &&
                        typeof m.text === "string" ? (
                        <TypewriterText
                          text={m.text}
                          render={renderMarkdown}
                          onComplete={() =>
                            setMessages((prev) =>
                              prev.map((msg) =>
                                msg.id === m.id ? { ...msg, isTyped: true } : msg
                              )
                            )}
                        />
                      ) : m.role === "assistant" ? (
                        renderMarkdown(m.text)
                      ) : (
                        m.text
                      )}
                    </div>
                    {m.role === "assistant" && !!m.sources?.length && (
                      <div className="ai-message-sources">
                        <span>Sources:</span>
                        <ul>
                          {m.sources.map((s, i) => (
                            <li key={s.id}>
                              <SourceChip
                                source={s}
                                {...(m.citationStyle === "numbered" ? { number: i + 1 } : {})}
                                available={isSourceAvailable(s.id)}
                                disabled={isSending}
                                onOpen={openSource}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {m.role === "assistant" && m.answerId && (
                      <div className="ai-message-feedback">
                        <button
                          type="button"
                          aria-label="Helpful answer"
                          aria-pressed={m.feedback === "up"}
                          onClick={() => rateAnswer(m, "up")}
                        >
                          <ThumbsUp size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label="Unhelpful answer"
                          aria-pressed={m.feedback === "down"}
                          onClick={() => rateAnswer(m, "down")}
                        >
                          <ThumbsDown size={14} />
                        </button>
                      </div>
                    )}
                    {m.role === "assistant" && timeString && <div className="ai-message-time">{timeString}</div>}
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
        {showScrollBtn && (
          <button
            type="button"
            className="ai-scroll-bottom-btn"
            onClick={scrollToBottom}
            aria-label="Scroll to bottom"
          >
            <ChevronDown size={18} />
          </button>
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
            <button
              type="button"
              className="ai-prompt-config-btn"
              onClick={() => setPromptModalOpen(true)}
            >
              <SlidersHorizontal size={13} />
              System Prompt
            </button>
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

      <SystemPromptModal
        isOpen={promptModalOpen}
        promptText={promptText}
        onClose={() => setPromptModalOpen(false)}
      />
    </div>
  );
}
