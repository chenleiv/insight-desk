import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusContext, type StatusApi } from "../../../../../../components/statusBar/statusContext";
import { ConfirmContext, type ConfirmFn } from "../../../../../../components/confirmModal/confirmContext";
import type { PromptConfig } from "../../../../../../api/aiClient";
import { AISection } from "../AISection";

type Suggestions = { questions: string[] };

const { getSystemPrompt, getSuggestions, resetSystemPrompt } = vi.hoisted(() => ({
  getSystemPrompt: vi.fn<() => Promise<PromptConfig>>(),
  getSuggestions: vi.fn<() => Promise<Suggestions>>(),
  resetSystemPrompt: vi.fn<() => Promise<PromptConfig>>(),
}));

vi.mock("../../../../../../api/aiClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../../api/aiClient")>()),
  getSystemPrompt,
  getSuggestions,
  resetSystemPrompt,
}));

const PROMPT: PromptConfig = { prompt: "Be helpful.", name: "default", version: "1", description: "" };

const status: StatusApi = { show: vi.fn(), clear: vi.fn() };
const confirm = vi.fn<ConfirmFn>();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function render({ readOnly = false } = {}) {
  act(() => root.render(
    <QueryClientProvider client={queryClient}>
      <StatusContext.Provider value={status}>
        <ConfirmContext.Provider value={confirm}>
          <AISection readOnly={readOnly} />
        </ConfirmContext.Provider>
      </StatusContext.Provider>
    </QueryClientProvider>
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
  resetSystemPrompt.mockReset();
  confirm.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient();
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

describe("AISection reset to default", () => {
  const resetButton = () => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Reset to default");
  const DEFAULT: PromptConfig = { prompt: "Default prompt.", name: "default", version: "1", description: "" };

  async function renderLoaded(options?: { readOnly?: boolean }) {
    render(options);
    await act(async () => {
      prompt.resolve(PROMPT);
      suggestions.resolve({ questions: [] });
    });
  }

  it("resets the prompt after the admin confirms, and shows the default", async () => {
    confirm.mockResolvedValue(true);
    resetSystemPrompt.mockResolvedValue(DEFAULT);
    await renderLoaded();

    await act(async () => resetButton()!.click());

    expect(confirm).toHaveBeenCalledOnce();
    expect(resetSystemPrompt).toHaveBeenCalledOnce();
    expect(textarea()?.value).toBe("Default prompt.");
    expect(status.show).toHaveBeenCalledWith({ kind: "success", title: "Reset", message: "System prompt reset to the default" });
  });

  it("labels only the reset button while resetting", async () => {
    const reset = deferred<PromptConfig>();
    confirm.mockResolvedValue(true);
    resetSystemPrompt.mockReturnValue(reset.promise);
    await renderLoaded();
    const button = resetButton()!;
    const saveButton = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Save prompt")!;

    await act(async () => button.click());

    expect(button.textContent).toBe("Resetting…");
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(saveButton.textContent).toBe("Save prompt");
    expect(saveButton.disabled).toBe(true);

    await act(async () => reset.resolve(DEFAULT));

    expect(button.textContent).toBe("Reset to default");
    expect(button.getAttribute("aria-busy")).toBe("false");
  });

  it("does nothing when the admin cancels", async () => {
    confirm.mockResolvedValue(false);
    await renderLoaded();

    await act(async () => resetButton()!.click());

    expect(resetSystemPrompt).not.toHaveBeenCalled();
    expect(textarea()?.value).toBe("Be helpful.");
  });

  it("keeps the prompt and shows the error when the reset fails", async () => {
    confirm.mockResolvedValue(true);
    resetSystemPrompt.mockRejectedValue(new Error("Reset failed"));
    await renderLoaded();

    await act(async () => resetButton()!.click());

    expect(textarea()?.value).toBe("Be helpful.");
    expect(status.show).toHaveBeenCalledWith({ kind: "error", title: "Error", message: "Reset failed" });
    expect(resetButton()?.disabled).toBe(false);
  });

  it("is disabled until the prompt loads", () => {
    render();

    expect(resetButton()?.disabled).toBe(true);
  });

  it("is not offered in the read-only demo view", async () => {
    await renderLoaded({ readOnly: true });

    expect(resetButton()).toBeUndefined();
  });
});
