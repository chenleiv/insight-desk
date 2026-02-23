import { useEffect, useRef } from "react";
import type { ChatMessage } from "../assistantTypes";
import TypewriterText from "./TypewriterText";
import InitialGreeting from "./InitialGreeting";

type Props = {
  messages: ChatMessage[];
  isThinking?: boolean;
  onTypingComplete?: (id: string) => void;
  onSelectDocuments: () => void;
};

export default function MessagesList({
  messages,
  isThinking,
  onTypingComplete,
  onSelectDocuments,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isThinking]);

  return (
    <div ref={containerRef} className="messages">
      {messages.map((m, idx) => {
        const isLastAssistantMessage =
          m.role === "assistant" && idx === messages.length - 1;

        return (
          <div
            key={m.id}
            className={`message ${m.role} ${m.isGreeting ? "greeting" : ""}`}
          >
            <div className="bubble">
              {m.isGreeting ? (
                <InitialGreeting onSelectDocuments={onSelectDocuments} />
              ) : isLastAssistantMessage &&
                m.isTyped === false &&
                typeof m.text === "string" ? (
                <TypewriterText
                  text={m.text}
                  onComplete={() => onTypingComplete?.(m.id)}
                />
              ) : (
                m.text
              )}
            </div>
          </div>
        );
      })}

      {isThinking && (
        <div className="message assistant thinking">
          <div className="bubble">
            <span />
            <span />
            <span />
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
