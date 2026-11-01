import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StatusContext, type StatusApi } from "../../../../../../components/statusBar/statusContext";
import type { PromptConfig } from "../../../../../../api/aiClient";
import { AISection } from "../AISection";

type Suggestions = { questions: string[] };

const { getSystemPrompt, getSuggestions } = vi.hoisted(() => ({
  getSystemPrompt: vi.fn<() => Promise<PromptConfig>>(),
  getSuggestions: vi.fn<() => Promise<Suggestions>>(),
}));

vi.mock("../../../../../../api/aiClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../../api/aiClient")>()),
  getSystemPrompt,
  getSuggestions,
}));

const PROMPT: PromptConfig = { prompt: "Be helpful.", name: "default", version: "1", description: "" };

const status: StatusApi = { show: vi.fn(), clear: vi.fn() };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let container: HTMLDivElement;
let root: Root;

function render() {
  act(() => root.render(
    <StatusContext.Provider value={status}>
      <AISection />
    </StatusContext.Provider>
  ));
}

const promptSkeleton = () => document.querySelector(".settings-ai-prompt-skeleton[aria-busy='true']");
const questionsSkeleton = () => document.querySelector(".settings-ai-questions-skeleton[aria-busy='true']");
const statusTexts = () => [...document.querySelectorAll("[role='status']")].map((el) => el.textContent);
const textarea = () => document.querySelector<HTMLTextAreaElement>(".settings-ai-textarea:not(.settings-ai-prompt-skeleton)");
const inputs = () => [...document.querySelectorAll<HTMLInputElement>("input.settings-input")];

let prompt: ReturnType<typeof deferred<PromptConfig>>;
let suggestions: ReturnType<typeof deferred<Suggestions>>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.mocked(status.show).mockClear();
  prompt = deferred<PromptConfig>();
  suggestions = deferred<Suggestions>();
  getSystemPrompt.mockReset().mockReturnValue(prompt.promise);
  getSuggestions.mockReset().mockReturnValue(suggestions.promise);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AISection loading state", () => {
  it("shows skeletons while the prompt and questions are pending, then the form", async () => {
    render();

    expect(promptSkeleton()).not.toBeNull();
    expect(questionsSkeleton()).not.toBeNull();
    expect(statusTexts()).toEqual(["Loading system prompt…", "Loading example questions…"]);
    expect(textarea()).toBeNull();
    expect(inputs()).toHaveLength(0);

    await act(async () => prompt.resolve(PROMPT));

    expect(promptSkeleton()).toBeNull();
    expect(textarea()?.value).toBe("Be helpful.");
    expect(textarea()?.disabled).toBe(false);
    // Each part leaves its skeleton on its own.
    expect(questionsSkeleton()).not.toBeNull();

    await act(async () => suggestions.resolve({ questions: ["What is in the handbook?"] }));

    expect(questionsSkeleton()).toBeNull();
    expect(inputs().map((i) => i.value)).toEqual(["What is in the handbook?", "", "", ""]);
  });

  it("shows the existing error toast and a disabled form, not a stuck loading state, on failure", async () => {
    render();

    await act(async () => {
      prompt.reject(new Error("Prompt failed"));
      suggestions.reject(new Error("Suggestions failed"));
    });

    expect(promptSkeleton()).toBeNull();
    expect(questionsSkeleton()).toBeNull();
    expect(status.show).toHaveBeenCalledWith({ kind: "error", title: "Error", message: "Prompt failed" });
    expect(status.show).toHaveBeenCalledWith({ kind: "error", title: "Error", message: "Suggestions failed" });
    expect(textarea()?.disabled).toBe(true);
    expect(textarea()?.placeholder).toBe("Could not load the system prompt.");
    expect(inputs().every((i) => i.disabled && i.placeholder === "Could not load")).toBe(true);
  });
});
