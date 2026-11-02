import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StatusContext, type StatusApi } from "../../../../../components/statusBar/statusContext";
import { CHAT_KEY } from "../../../../../storageKeys";
import type { ChatResponse } from "../../../../../api/aiClient";
import type { ChatMessage } from "../assistantTypes";
import AIAssistantView from "../AIAssistantView";

const { chatWithAI, documents } = vi.hoisted(() => ({
  chatWithAI: vi.fn<(message: string) => Promise<ChatResponse>>(),
  documents: {
    current: { docs: [{ id: "d1" }], loading: false, error: null } as {
      docs: { id: string }[];
      loading: boolean;
      error: string | null;
    },
  },
}));

vi.mock("../../../../../api/aiClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../api/aiClient")>()),
  chatWithAI,
  getSuggestions: () => Promise.resolve({ questions: [] }),
}));
vi.mock("../../../../../auth/useAuth", () => ({
  useAuth: () => ({ user: { email: "admin@example.com", role: "admin" } }),
}));
vi.mock("../../../../../context/DocumentsContext", () => ({
  useDocuments: () => documents.current,
}));

// Node's own localStorage global hides jsdom's here, so tests get a small in-memory one.
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    key: (i) => [...items.keys()][i] ?? null,
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => { items.set(k, String(v)); },
    removeItem: (k) => { items.delete(k); },
    clear: () => items.clear(),
  };
}

const USER: ChatMessage = { id: "u1", role: "user", text: "Question" };
const OLD_ANSWER: ChatMessage = {
  id: "a1",
  role: "assistant",
  text: "Long[Vacation Policy][Travel Guide].",
  sources: [{ id: "d1", title: "Vacation Policy" }],
  isTyped: true,
};
const NEW_ANSWER: ChatMessage = {
  id: "a2",
  role: "assistant",
  text: "Twenty days.",
  sources: [{ id: "d1", title: "Vacation Policy" }],
  sentAt: new Date(2026, 0, 15, 9, 30).getTime(),
  isTyped: true,
};

const status: StatusApi = { show: vi.fn(), clear: vi.fn() };
const onOpenDocument = vi.fn<(id: string) => void>();
let container: HTMLDivElement;
let root: Root;

function renderChat(saved?: ChatMessage[]) {
  if (saved) localStorage.setItem(CHAT_KEY, JSON.stringify(saved));
  act(() => root.render(
    <StatusContext.Provider value={status}>
      <AIAssistantView onOpenDocument={onOpenDocument} />
    </StatusContext.Provider>
  ));
}

const chips = () => [...container.querySelectorAll<HTMLButtonElement>(".ai-message-sources button")];
const saved = () => JSON.parse(localStorage.getItem(CHAT_KEY)!) as ChatMessage[];

async function ask() {
  const suggestion = container.querySelector<HTMLButtonElement>(".ai-suggestion-card");
  if (suggestion) {
    act(() => suggestion.click());
  } else {
    const input = container.querySelector("textarea")!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    act(() => {
      setValue.call(input, "Another question");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  await act(async () => container.querySelector<HTMLButtonElement>(".ai-send-btn")!.click());
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", memoryStorage());
  // jsdom has no layout, so it does not implement this.
  Element.prototype.scrollIntoView = vi.fn();
  documents.current = { docs: [{ id: "d1" }], loading: false, error: null };
  vi.mocked(status.show).mockClear();
  onOpenDocument.mockClear();
  chatWithAI.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("saved answers", () => {
  it("shows an old answer as it was saved, with a clickable chip", () => {
    renderChat([USER, OLD_ANSWER]);
    expect(container.querySelector(".ai-message.assistant .ai-bubble")!.textContent).toBe(OLD_ANSWER.text);
    expect(chips()[0].textContent).toBe("Vacation Policy");
    expect(chips()[0].getAttribute("aria-label")).toBe("Open source: Vacation Policy");
    act(() => chips()[0].click());
    expect(onOpenDocument).toHaveBeenCalledWith("d1");
  });

  it("names a chip by its title, with no number", () => {
    renderChat([USER, NEW_ANSWER]);
    expect(chips()[0].textContent).toBe("Vacation Policy");
    expect(chips()[0].getAttribute("aria-label")).toBe("Open source: Vacation Policy");
  });

  it("shows a saved answer whole instead of typing it again", () => {
    renderChat([USER, { ...NEW_ANSWER, isTyped: false }]);
    expect(container.querySelector(".typewriter")).toBeNull();
    expect(container.querySelector(".ai-message.assistant .ai-bubble")!.textContent).toBe(NEW_ANSWER.text);
  });

  it("opens at the latest message when coming back to the chat", () => {
    const height = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(900);
    renderChat([USER, NEW_ANSWER]);
    expect(container.querySelector(".ai-messages")!.scrollTop).toBe(900);
    height.mockRestore();
  });
});

describe("message time", () => {
  it("shows the stored time of the message", () => {
    renderChat([USER, NEW_ANSWER]);
    expect(container.querySelector(".ai-message-time")!.textContent).toBe(
      new Date(NEW_ANSWER.sentAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  });

  it("shows no time for an old message without one", () => {
    renderChat([USER, OLD_ANSWER]);
    expect(container.querySelector(".ai-message-time")).toBeNull();
  });

  it("stores the send time on new messages", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    chatWithAI.mockResolvedValue({ answer: "No.", citations: [], answerId: null });
    renderChat();
    await ask();
    vi.mocked(Date.now).mockRestore();
    expect(saved().map((m) => m.sentAt)).toEqual([1_800_000_000_000, 1_800_000_000_000]);
  });
});

describe("right-to-left answers", () => {
  it("lets the bubble take its direction from the text", () => {
    renderChat([USER, NEW_ANSWER]);
    expect(container.querySelector(".ai-bubble")!.getAttribute("dir")).toBe("auto");
    expect(container.querySelector(".ai-message.assistant .ai-bubble")!.getAttribute("dir")).toBe("auto");
  });
});

describe("source chips", () => {
  const citation = { id: "c1", docId: "d1", title: "Vacation Policy", index: 0 };

  it("removes citations from a new answer and builds chips from the verified ones only", async () => {
    chatWithAI.mockResolvedValue({ answer: "Twenty days [c1] and more [c9].", citations: [citation], answerId: null });
    renderChat();
    await ask();
    const answer = saved().at(-1)!;
    expect(answer.text).toBe("Twenty days and more.");
    expect(answer.sources).toEqual([{ id: "d1", title: "Vacation Policy" }]);
    expect(chips()).toHaveLength(1);
  });

  it("shows a short text above the chips when an answer holds only citations", async () => {
    chatWithAI.mockResolvedValue({ answer: "[c1]", citations: [citation], answerId: null });
    renderChat();
    await ask();
    expect(saved().at(-1)!.text).toBe("See the sources below.");
    expect(chips()).toHaveLength(1);
    expect(chips()[0].textContent).toBe("Vacation Policy");
  });

  it("shows one chip for a document cited through several chunks", async () => {
    chatWithAI.mockResolvedValue({
      answer: "One [c1]. Two [c2].",
      citations: [citation, { ...citation, id: "c2", index: 3 }],
      answerId: null,
    });
    renderChat();
    await ask();
    expect(chips()).toHaveLength(1);
    expect(saved().at(-1)!.text).toBe("One. Two.");
  });

  it("shows no chip for a citation the server did not verify", async () => {
    chatWithAI.mockResolvedValue({ answer: "Twenty days [c1].", citations: [], answerId: null });
    renderChat();
    await ask();
    expect(chips()).toHaveLength(0);
    expect(saved().at(-1)!.text).toBe("Twenty days.");
  });

  it("is a real button that opens its document", () => {
    renderChat([USER, NEW_ANSWER]);
    expect(chips()[0].getAttribute("type")).toBe("button");
    expect(chips()[0].disabled).toBe(false);
    act(() => chips()[0].click());
    expect(onOpenDocument).toHaveBeenCalledWith("d1");
    expect(status.show).not.toHaveBeenCalled();
  });

  it("says a document is gone instead of opening it", () => {
    documents.current = { docs: [{ id: "other" }], loading: false, error: null };
    renderChat([USER, NEW_ANSWER]);
    expect(chips()[0].getAttribute("aria-disabled")).toBe("true");
    expect(chips()[0].getAttribute("aria-label")).toBe("Source: Vacation Policy, no longer available");
    act(() => chips()[0].click());
    expect(onOpenDocument).not.toHaveBeenCalled();
    expect(status.show).toHaveBeenCalledWith({ kind: "info", message: "This document is no longer available." });
  });

  it("does not call a document gone when the list failed to load", () => {
    documents.current = { docs: [], loading: false, error: "Network error" };
    renderChat([USER, NEW_ANSWER]);
    expect(chips()[0].getAttribute("aria-disabled")).toBeNull();
    act(() => chips()[0].click());
    expect(onOpenDocument).not.toHaveBeenCalled();
    expect(status.show).toHaveBeenCalledWith({ kind: "error", message: "Documents could not be loaded. Please try again." });
  });

  it("opens the document while the list is still loading", () => {
    documents.current = { docs: [], loading: true, error: null };
    renderChat([USER, NEW_ANSWER]);
    act(() => chips()[0].click());
    expect(onOpenDocument).toHaveBeenCalledWith("d1");
  });

  it("is disabled while an answer is on its way, so leaving the chat cannot lose it", async () => {
    let answer!: (response: ChatResponse) => void;
    chatWithAI.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    renderChat([USER, NEW_ANSWER]);
    await ask();
    expect(chips()[0].disabled).toBe(true);
    await act(async () => answer({ answer: "No.", citations: [], answerId: null }));
    expect(chips()[0].disabled).toBe(false);
  });
});
