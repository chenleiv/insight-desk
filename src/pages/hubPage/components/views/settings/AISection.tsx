import { useEffect, useRef, useState } from "react";
import {
  getSystemPrompt,
  updateSystemPrompt,
  getSuggestions,
  updateSuggestions,
} from "../../../../../api/aiClient";
import { useStatus } from "../../../../../components/statusBar/useStatus";

export function AISection({ readOnly = false }: { readOnly?: boolean }) {
  const status = useStatus();

  const [promptDraft, setPromptDraft] = useState("");
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptLoaded, setPromptLoaded] = useState(false);

  const [questions, setQuestions] = useState<string[]>(["", "", "", ""]);
  const [questionsSaving, setQuestionsSaving] = useState(false);
  const [questionsLoaded, setQuestionsLoaded] = useState(false);

  const statusRef = useRef(status);

  useEffect(() => {
    getSystemPrompt()
      .then((r) => { setPromptDraft(r.prompt); setPromptLoaded(true); })
      .catch((e) => statusRef.current.show({ kind: "error", title: "Error", message: e.message }));
    getSuggestions()
      .then((r) => {
        const padded = [...r.questions];
        while (padded.length < 4) padded.push("");
        setQuestions(padded.slice(0, 4));
        setQuestionsLoaded(true);
      })
      .catch((e) => statusRef.current.show({ kind: "error", title: "Error", message: e.message }));
  }, []);

  async function savePrompt() {
    setPromptSaving(true);
    try {
      await updateSystemPrompt(promptDraft);
      status.show({ kind: "success", title: "Saved", message: "System prompt updated" });
    } catch (e) {
      status.show({ kind: "error", title: "Error", message: e instanceof Error ? e.message : "Failed" });
    } finally {
      setPromptSaving(false);
    }
  }

  async function saveQuestions() {
    setQuestionsSaving(true);
    try {
      const filtered = questions.map((q) => q.trim()).filter(Boolean);
      await updateSuggestions(filtered);
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
          <textarea
            className="settings-ai-textarea"
            value={promptDraft}
            onChange={(e) => setPromptDraft(e.target.value)}
            readOnly={readOnly}
            disabled={!promptLoaded || promptSaving}
            rows={12}
            placeholder="Loading…"
          />
          <button
            type="button"
            className="settings-save-btn"
            disabled={readOnly || !promptLoaded || promptSaving}
            onClick={savePrompt}
          >
            {promptSaving ? "Saving…" : "Save prompt"}
          </button>
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
          {questions.map((q, i) => (
            <label key={i} className="settings-field">
              Question {i + 1}
              <input
                className="settings-input"
                value={q}
                onChange={(e) => setQuestions((prev) => prev.map((v, idx) => idx === i ? e.target.value : v))}
                readOnly={readOnly}
                disabled={!questionsLoaded || questionsSaving}
                placeholder={`Example question ${i + 1}`}
              />
            </label>
          ))}
          <button
            type="button"
            className="settings-save-btn"
            disabled={readOnly || !questionsLoaded || questionsSaving}
            onClick={saveQuestions}
          >
            {questionsSaving ? "Saving…" : "Save questions"}
          </button>
        </div>
      </div>
    </>
  );
}
