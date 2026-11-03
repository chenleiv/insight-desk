import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { compile } from "sass";
import { StatusContext, type StatusApi } from "../../../../../components/statusBar/statusContext";
import { CHAT_KEY } from "../../../../../storageKeys";
import type { ChatResponse } from "../../../../../api/aiClient";
import type { ChatMessage } from "../assistantTypes";
import AIAssistantView from "../AIAssistantView";

const { chatWithAI } = vi.hoisted(() => ({
  chatWithAI: vi.fn<(message: string) => Promise<ChatResponse>>(),
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
  useDocuments: () => ({ docs: [{ id: "d1" }], loading: false, error: null }),
}));

const USER: ChatMessage = { id: "u1", role: "user", text: "Question" };
const ANSWER: ChatMessage = { id: "a1", role: "assistant", text: "Answer", isTyped: true };
const ANSWER_RESPONSE: ChatResponse = { answer: "Done.", citations: [], answerId: null };

// useMobile keeps one MediaQueryList per query, so these read the current screen when asked.
const screen = { phoneWidth: true, touch: true };
const status: StatusApi = { show: vi.fn(), clear: vi.fn() };
let container: HTMLDivElement;
let root: Root;
let resizeCallbacks: (() => void)[];

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

function renderChat(saved: ChatMessage[] = [USER, ANSWER]) {
  localStorage.setItem(CHAT_KEY, JSON.stringify(saved));
  act(() => root.render(
    <StatusContext.Provider value={status}>
      <AIAssistantView onOpenDocument={vi.fn()} />
    </StatusContext.Provider>
  ));
}

const input = () => container.querySelector("textarea")!;
const sendButton = () => container.querySelector<HTMLButtonElement>(".ai-send-btn")!;
const list = () => container.querySelector<HTMLDivElement>(".ai-messages")!;
const scrollButton = () => container.querySelector<HTMLButtonElement>(".ai-scroll-bottom-btn");

function type(text: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(input(), text);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Returns whether the browser's default, a new line in the field, would still happen. */
function pressEnter() {
  return input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
}

function pendingAnswer() {
  let answer!: (response: ChatResponse) => void;
  chatWithAI.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
  return () => act(async () => answer(ANSWER_RESPONSE));
}

// jsdom has no layout, so the list's sizes are set by hand.
function layOut(scrollHeight: number, clientHeight = 400) {
  Object.defineProperty(list(), "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(list(), "clientHeight", { configurable: true, value: clientHeight });
}

function scrollTo(top: number) {
  list().scrollTop = top;
  act(() => { list().dispatchEvent(new Event("scroll")); });
}

// The typewriter's DOM change, which reaches the view only through its observer.
async function contentChanges(scrollHeight: number) {
  layOut(scrollHeight);
  await act(async () => { list().appendChild(document.createElement("span")); });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", memoryStorage());
  Element.prototype.scrollIntoView = vi.fn();
  screen.phoneWidth = true;
  screen.touch = true;
  resizeCallbacks = [];
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() { return query.includes("pointer: coarse") ? screen.touch : screen.phoneWidth; },
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resizeCallbacks.push(callback); }
    observe() {}
    disconnect() {}
  });
  chatWithAI.mockReset();
  chatWithAI.mockResolvedValue(ANSWER_RESPONSE);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Enter in the input", () => {
  it("adds a new line on a phone", () => {
    renderChat();
    type("Question");
    let allowed = false;
    act(() => { allowed = pressEnter(); });
    expect(allowed).toBe(true);
    expect(chatWithAI).not.toHaveBeenCalled();
  });

  it.each([
    ["a desktop screen", { phoneWidth: false, touch: false }],
    ["a touch tablet", { phoneWidth: false, touch: true }],
    ["a narrow window with a mouse", { phoneWidth: true, touch: false }],
  ])("sends on %s", async (_name, media) => {
    Object.assign(screen, media);
    renderChat();
    type("Question");
    let allowed = true;
    await act(async () => { allowed = pressEnter(); });
    expect(allowed).toBe(false);
    expect(chatWithAI).toHaveBeenCalledWith("Question");
  });
});

describe("while an answer is pending", () => {
  it("keeps the input enabled on a phone and sends only one question", async () => {
    const answer = pendingAnswer();
    renderChat();
    type("First");
    await act(async () => sendButton().click());
    expect(input().disabled).toBe(false);

    type("Second");
    await act(async () => sendButton().click());
    expect(chatWithAI).toHaveBeenCalledTimes(1);
    expect(input().value).toBe("Second");

    await answer();
    expect(input().value).toBe("Second");
    await act(async () => sendButton().click());
    expect(chatWithAI).toHaveBeenCalledTimes(2);
    expect(chatWithAI).toHaveBeenLastCalledWith("Second");
  });

  it("sends once when two taps land before a render", async () => {
    const answer = pendingAnswer();
    renderChat();
    type("First");
    await act(async () => {
      sendButton().click();
      sendButton().click();
    });
    expect(chatWithAI).toHaveBeenCalledTimes(1);
    await answer();
  });

  it("still disables the input on a desktop screen", async () => {
    screen.phoneWidth = false;
    screen.touch = false;
    const answer = pendingAnswer();
    renderChat();
    type("First");
    await act(async () => sendButton().click());
    expect(input().disabled).toBe(true);
    await answer();
  });
});

describe("send button", () => {
  it("cannot take focus from the input on a phone", () => {
    renderChat();
    const pressed = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    act(() => { sendButton().dispatchEvent(pressed); });
    expect(pressed.defaultPrevented).toBe(true);
  });

  it("marks an empty input without the disabled attribute on a phone", () => {
    renderChat();
    expect(sendButton().disabled).toBe(false);
    expect(sendButton().getAttribute("aria-disabled")).toBe("true");
    act(() => sendButton().click());
    expect(chatWithAI).not.toHaveBeenCalled();
    type("Question");
    expect(sendButton().getAttribute("aria-disabled")).toBe("false");
  });

  it("uses the disabled attribute on a desktop screen", () => {
    screen.phoneWidth = false;
    screen.touch = false;
    renderChat();
    expect(sendButton().disabled).toBe(true);
    expect(sendButton().hasAttribute("aria-disabled")).toBe(false);
  });
});

describe("input height", () => {
  it("follows the text on a phone, and shrinks again after sending", async () => {
    const height = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(120);
    renderChat();
    type("One\nTwo\nThree\nFour");
    expect(input().style.height).toBe("120px");
    height.mockReturnValue(44);
    await act(async () => sendButton().click());
    expect(input().value).toBe("");
    expect(input().style.height).toBe("44px");
    height.mockRestore();
  });

  it("is left to the stylesheet on a desktop screen", () => {
    screen.phoneWidth = false;
    screen.touch = false;
    renderChat();
    type("One\nTwo\nThree\nFour");
    expect(input().style.height).toBe("");
  });
});

describe("following the answer on a phone", () => {
  it("follows new content from the bottom", async () => {
    renderChat();
    layOut(1000);
    scrollTo(600);
    await contentChanges(1100);
    expect(list().scrollTop).toBe(1100);
    expect(scrollButton()).toBeNull();
  });

  it("stays at the bottom when the list gets shorter", () => {
    renderChat();
    layOut(1000);
    scrollTo(600);
    layOut(1000, 200);
    act(() => resizeCallbacks.forEach((callback) => callback()));
    expect(list().scrollTop).toBe(1000);
  });

  it("leaves the position alone when a typed character adds no line", async () => {
    renderChat();
    await contentChanges(1000);
    list().scrollTop = 595;
    await contentChanges(1000);
    expect(list().scrollTop).toBe(595);
  });

  it("stops after the smallest scroll upward and shows the button", async () => {
    renderChat();
    layOut(1000);
    scrollTo(600);
    scrollTo(597);
    expect(scrollButton()).not.toBeNull();
    await contentChanges(1100);
    expect(list().scrollTop).toBe(597);
  });

  it("drops the button with no scroll once the end comes back into view", async () => {
    renderChat();
    layOut(1000);
    scrollTo(600);
    scrollTo(500);
    await contentChanges(1100);
    expect(scrollButton()).not.toBeNull();
    await contentChanges(900);
    expect(list().scrollTop).toBe(500);
    expect(scrollButton()).toBeNull();
  });

  it("resumes from the button", async () => {
    renderChat();
    layOut(1000);
    scrollTo(600);
    scrollTo(100);
    act(() => scrollButton()!.click());
    expect(list().scrollTop).toBe(1000);
    expect(scrollButton()).toBeNull();
    await contentChanges(1100);
    expect(list().scrollTop).toBe(1100);
  });

  it("resumes when the user asks a new question", async () => {
    renderChat();
    layOut(1000);
    scrollTo(600);
    scrollTo(100);
    type("Next");
    await act(async () => sendButton().click());
    await contentChanges(1200);
    expect(list().scrollTop).toBe(1200);
  });

  it("removes the button with the list when the chat is cleared", () => {
    renderChat();
    layOut(1000);
    scrollTo(600);
    scrollTo(100);
    expect(scrollButton()).not.toBeNull();
    act(() => container.querySelector<HTMLButtonElement>(".ai-clear-chat-btn")!.click());
    expect(scrollButton()).toBeNull();
  });
});

describe("phone styles", () => {
  const css = compile("src/pages/hubPage/components/views/aiAssistant.scss").css;
  const phoneStart = css.indexOf("@media (max-width: 767px)");
  const before = css.slice(0, phoneStart);

  it("apply by screen width, so a narrow desktop pane keeps its look", () => {
    expect(phoneStart).toBeGreaterThan(-1);
    expect(before).not.toMatch(/\.ai-avatar \{\s*display: none/);
    expect(css.slice(phoneStart)).toMatch(/\.ai-avatar \{\s*display: none/);
  });

  it("paint a smaller shape only on touch phones", () => {
    expect(before).not.toContain(".ai-message-sources button::before");
    expect(css).toMatch(/@media \(max-width: 767px\) and \(pointer: coarse\) \{[^@]*\.ai-message-sources button::before/);
  });
});
