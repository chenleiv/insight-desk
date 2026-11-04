import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusContext, type StatusApi } from "../../../../components/statusBar/statusContext";
import { AISection } from "../../components/views/settings/AISection";
import { useSuggestions } from "../useSuggestions";

const { getSuggestions, updateSuggestions } = vi.hoisted(() => ({
  getSuggestions: vi.fn<() => Promise<{ questions: string[] }>>(),
  updateSuggestions: vi.fn<(questions: string[]) => Promise<{ questions: string[] }>>(),
}));

vi.mock("../../../../api/aiClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/aiClient")>()),
  getSuggestions,
  updateSuggestions,
  getSystemPrompt: () => Promise.resolve({ prompt: "Be helpful.", name: "default", version: "1", description: "" }),
}));

const MINUTE = 60 * 1000;
const status: StatusApi = { show: vi.fn(), clear: vi.fn() };

function Chat() {
  const { data } = useSuggestions();
  return <p className="questions">{data?.questions.join("|") ?? "defaults"}</p>;
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

const shown = () => container.querySelector(".questions")?.textContent;
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

async function show(view: React.ReactNode) {
  act(() => root.render(
    <QueryClientProvider client={queryClient}>
      <StatusContext.Provider value={status}>{view}</StatusContext.Provider>
    </QueryClientProvider>
  ));
  await wait(1);
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  getSuggestions.mockReset().mockResolvedValue({ questions: ["One?"] });
  updateSuggestions.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient();
});

afterEach(() => {
  act(() => root.unmount());
  queryClient.clear();
  container.remove();
  vi.useRealTimers();
});

describe("useSuggestions", () => {
  it("does not fetch again when the chat is entered again, even after a long time away", async () => {
    await show(<Chat />);
    expect(shown()).toBe("One?");

    await show(null);
    await wait(30 * MINUTE);
    await show(<Chat />);

    expect(shown()).toBe("One?");
    expect(getSuggestions).toHaveBeenCalledOnce();
  });

  it("fetches again once the cached questions are an hour old", async () => {
    await show(<Chat />);
    await show(null);
    await wait(61 * MINUTE);
    await show(<Chat />);

    expect(getSuggestions).toHaveBeenCalledTimes(2);
  });

  it("does not retry a failed request", async () => {
    getSuggestions.mockRejectedValue(new Error("Too many requests"));

    await show(<Chat />);
    await wait(MINUTE);

    expect(shown()).toBe("defaults");
    expect(getSuggestions).toHaveBeenCalledOnce();
  });

  it("shows questions an admin just saved, without fetching them", async () => {
    await show(<Chat />);
    updateSuggestions.mockResolvedValue({ questions: ["Saved?"] });

    await show(<AISection />);
    const save = [...container.querySelectorAll("button")].filter((b) => b.textContent?.includes("Save")).at(-1)!;
    await act(async () => { save.click(); await vi.advanceTimersByTimeAsync(1); });
    expect(updateSuggestions).toHaveBeenCalledOnce();

    const fetched = getSuggestions.mock.calls.length;
    await show(<Chat />);

    expect(shown()).toBe("Saved?");
    expect(getSuggestions).toHaveBeenCalledTimes(fetched);
  });
});
