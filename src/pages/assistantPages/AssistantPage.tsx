import { useEffect, useState } from "react";
import "./assistantPage.scss";

import { useDocuments } from "../../context/DocumentsContext";
import { chatWithAI } from "../../api/aiClient";
import type { ChatMessage, SourceRef } from "./types";
import { CHAT_KEY, CONTEXT_KEY, buildSnippet, scoreDoc, uid } from "./utils";
import { sameArray } from "../documentsPages/utils/ordering";
import { Check, PanelLeft } from "lucide-react";

import ContextPanel from "./components/ContextPanel";
import MessagesList from "./components/MessagesList";
import Composer from "./components/Composer";
import { loadJson, saveJson } from "../../utils/storage";

export default function AssistantPage() {
  const { docs, loading: docsLoading, loadDocuments } = useDocuments();

  const GREETING_TEXT = "How can I help you?";

  const [contextQuery, setContextQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>(
    loadJson<number[]>(CONTEXT_KEY, []),
  );

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
  const [isContextOpen, setIsContextOpen] = useState(false);

  function onClearSelection() {
    setSelectedIds([]);
    saveJson(CONTEXT_KEY, []);
  }

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    saveJson(CHAT_KEY, messages);
  }, [messages]);

  const showContextPanel = isContextOpen;

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      saveJson(CONTEXT_KEY, next);
      if (next.length > prev.length) {
        setIsContextOpen(true);
      }
      return next;
    });
  }

  const selectedDocs = (() => {
    if (selectedIds.length === 0) return [];
    const set = new Set(selectedIds);
    return docs.filter((d) => set.has(d.id));
  })();

  useEffect(() => {
    if (docs.length > 0) {
      const ids = new Set(docs.map((d) => d.id));
      setSelectedIds((prev) => {
        const next = prev.filter((id) => ids.has(id));
        if (!sameArray(next, prev)) saveJson(CONTEXT_KEY, next);
        return next;
      });
    }
  }, [docs]);

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
        .map((d) => ({ doc: d, score: scoreDoc(d, question) }))
        .sort((a, b) => b.score - a.score);

      const top = ranked
        .filter((x) => x.score > 0)
        .slice(0, 3)
        .map((x) => x.doc);

      const response = await chatWithAI(question, top);

      const sources: SourceRef[] = response.sources.map((s) => ({
        id: s.id,
        title: s.title,
        snippet: buildSnippet(
          contextDocs.find((d) => d.id === s.id)?.content || "",
          question,
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

  return (
    <div
      className={`assistant-shell ${
        showContextPanel ? "with-context" : "no-context"
      }`}
    >
      <aside
        className={`context-panel-container ${showContextPanel ? "mobile-open" : ""}`}
      >
        <div className="context-panel-inner">
          <ContextPanel
            docs={docs}
            loading={docsLoading}
            selectedIds={selectedIds}
            contextQuery={contextQuery}
            onToggleSelected={toggleSelected}
            onChangeQuery={(q) => {
              setContextQuery(q);
              if (q.trim().length > 0) setIsContextOpen(true);
            }}
            onClearSelection={onClearSelection}
          />
        </div>
      </aside>

      {showContextPanel && (
        <button
          onClick={() => setIsContextOpen(false)}
          className="mobile-context-close-btn"
          aria-label="Close context"
        >
          <Check />
        </button>
      )}

      <section className="assistant-page">
        <div className="assistant-page-inner">
          <MessagesList
            messages={messages}
            isThinking={isSending}
            onTypingComplete={handleTypingComplete}
            onSelectDocuments={() => setIsContextOpen(true)}
          />
          <div className="assistant-topbar">
            <button
              type="button"
              className="text-btn"
              onClick={clearChat}
              disabled={messages.length === 0}
            >
              Clear chat
            </button>

            <button
              type="button"
              className="icon-btn mobile-only-btn"
              onClick={() => setIsContextOpen(!isContextOpen)}
              title="Toggle Context"
            >
              <PanelLeft size={26} />
            </button>
          </div>

          <Composer
            value={input}
            disabled={isSending}
            onChange={setInput}
            onSend={send}
          />
        </div>
      </section>
    </div>
  );
}
