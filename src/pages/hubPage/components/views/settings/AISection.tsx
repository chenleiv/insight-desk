import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getSystemPrompt,
  updateSystemPrompt,
  resetSystemPrompt,
  getSuggestions,
  updateSuggestions,
} from "../../../../../api/aiClient";
import { useStatus } from "../../../../../components/statusBar/useStatus";
import { SkeletonLine, SkeletonRegion } from "../../../../../components/skeleton/Skeleton";
import { LoadError } from "../../../../../components/loadError/LoadError";
import { SUGGESTIONS_QUERY_KEY } from "../../../hooks/useSuggestions";
import useConfirm from "../../../../../hooks/useConfirm";

// Matches the four question fields the loaded form always shows.
const QUESTION_COUNT = 4;

export function AISection({ readOnly = false }: { readOnly?: boolean }) {
  const status = useStatus();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const [promptDraft, setPromptDraft] = useState("");
  const [promptAction, setPromptAction] = useState<"saving" | "resetting" | null>(null);
  const [promptLoaded, setPromptLoaded] = useState(false);
  const [promptFailed, setPromptFailed] = useState(false);
  const [promptAttempt, setPromptAttempt] = useState(0);

  const [questions, setQuestions] = useState<string[]>(["", "", "", ""]);
  const [questionsSaving, setQuestionsSaving] = useState(false);
  const [questionsLoaded, setQuestionsLoaded] = useState(false);
  const [questionsFailed, setQuestionsFailed] = useState(false);
  const [questionsAttempt, setQuestionsAttempt] = useState(0);

  useEffect(() => {
    getSystemPrompt()
      .then((r) => { setPromptDraft(r.prompt); setPromptLoaded(true); })
      .catch(() => setPromptFailed(true));
  }, [promptAttempt]);

  useEffect(() => {
    getSuggestions()
      .then((r) => {
        const padded = [...r.questions];
        while (padded.length < 4) padded.push("");
        setQuestions(padded.slice(0, 4));
        setQuestionsLoaded(true);
      })
      .catch(() => setQuestionsFailed(true));
  }, [questionsAttempt]);

  function retryPrompt() {
    setPromptFailed(false);
    setPromptAttempt((n) => n + 1);
  }

  function retryQuestions() {
    setQuestionsFailed(false);
    setQuestionsAttempt((n) => n + 1);
  }

  async function savePrompt() {
    setPromptAction("saving");
    try {
      await updateSystemPrompt(promptDraft);
      status.show({ kind: "success", title: "Saved", message: "System prompt updated" });
    } catch (e) {
      status.show({ kind: "error", title: "Error", message: e instanceof Error ? e.message : "Failed" });
    } finally {
      setPromptAction(null);
    }
  }

  async function resetPrompt() {
    const ok = await confirm({
      title: "Reset to default?",
      message: "The saved system prompt will be deleted, and the assistant will use the default prompt.",
      confirmLabel: "Reset",
    });
    if (!ok) return;
    setPromptAction("resetting");
    try {
      setPromptDraft((await resetSystemPrompt()).prompt);
      status.show({ kind: "success", title: "Reset", message: "System prompt reset to the default" });
    } catch (e) {
      status.show({ kind: "error", title: "Error", message: e instanceof Error ? e.message : "Failed" });
    } finally {
      setPromptAction(null);
    }
  }

  async function saveQuestions() {
    setQuestionsSaving(true);
    try {
      const filtered = questions.map((q) => q.trim()).filter(Boolean);
      // So the chat shows the saved questions at once, not when its cached copy goes stale.
      queryClient.setQueryData(SUGGESTIONS_QUERY_KEY, await updateSuggestions(filtered));
      status.show({ kind: "success", title: "Saved", message: "Example questions updated" });
    } catch (e) {
      status.show({ kind: "error", title: "Error", message: e instanceof Error ? e.message : "Failed" });
    } finally {
      setQuestionsSaving(false);
    }
  }

  return (
    <>
      <div className="settings-card">
        <div className="settings-card-header">
          <div>
            <h2>System Prompt</h2>
            <p>Defines how the AI assistant behaves and responds</p>
            {readOnly && <p className="settings-readonly-note">Admin only · View only in the demo</p>}
          </div>
        </div>
        <div className="settings-form">
          {promptFailed ? (
            <LoadError message="Could not load the system prompt." onRetry={retryPrompt} />
          ) : !promptLoaded ? (
            <SkeletonRegion label="Loading system prompt…" className="settings-ai-textarea settings-ai-prompt-skeleton">
              <SkeletonLine width="90%" />
              <SkeletonLine width="100%" />
              <SkeletonLine width="75%" />
              <SkeletonLine width="85%" />
              <SkeletonLine width="40%" />
            </SkeletonRegion>
          ) : (
            <textarea
              className="settings-ai-textarea"
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              readOnly={readOnly}
              disabled={promptAction !== null}
              rows={12}
            />
          )}
          <div className="settings-ai-prompt-actions">
            <button
              type="button"
              className="settings-save-btn"
              disabled={readOnly || !promptLoaded || promptAction !== null}
              aria-busy={promptAction === "saving"}
              onClick={savePrompt}
            >
              {promptAction === "saving" ? "Saving…" : "Save prompt"}
            </button>
            {!readOnly && (
              <button
                type="button"
                className="settings-cancel-btn"
                disabled={!promptLoaded || promptAction !== null}
                aria-busy={promptAction === "resetting"}
                onClick={resetPrompt}
              >
                {promptAction === "resetting" ? "Resetting…" : "Reset to default"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-header">
          <div>
            <h2>Example Questions</h2>
            <p>Starter suggestions shown to users before their first message</p>
          </div>
        </div>
        <div className="settings-form">
          {questionsFailed ? (
            <LoadError message="Could not load the example questions." onRetry={retryQuestions} />
          ) : !questionsLoaded ? (
            <SkeletonRegion label="Loading example questions…" className="settings-ai-questions-skeleton">
              {Array.from({ length: QUESTION_COUNT }, (_, i) => (
                <div key={i} className="settings-field">
                  Question {i + 1}
                  <span className="settings-input settings-input-skeleton"><SkeletonLine width="60%" /></span>
                </div>
              ))}
            </SkeletonRegion>
          ) : (
            questions.map((q, i) => (
              <label key={i} className="settings-field">
                Question {i + 1}
                <input
                  className="settings-input"
                  value={q}
                  onChange={(e) => setQuestions((prev) => prev.map((v, idx) => idx === i ? e.target.value : v))}
                  readOnly={readOnly}
                  disabled={questionsSaving}
                  placeholder={`Example question ${i + 1}`}
                />
              </label>
            ))
          )}
          <button
            type="button"
            className="settings-save-btn"
            disabled={readOnly || !questionsLoaded || questionsSaving}
            aria-busy={questionsSaving}
            onClick={saveQuestions}
          >
            {questionsSaving ? "Saving…" : "Save questions"}
          </button>
        </div>
      </div>
    </>
  );
}
