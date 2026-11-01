import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import type { QualityDays, QualitySummary } from "../../../../../api/aiClient";
import QualityView from "../QualityView";

const { getQualitySummary } = vi.hoisted(() => ({
  getQualitySummary: vi.fn<(days: QualityDays) => Promise<QualitySummary>>(),
}));

vi.mock("../../../../../api/aiClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../api/aiClient")>()),
  getQualitySummary,
}));

const counts = { answers: 10, rated: 4, up: 3, down: 1 };
const SUMMARY: QualitySummary = {
  days: 7,
  questions: 42,
  noInfo: 5,
  noResults: 2,
  meanTopScore: 0.512,
  buckets: [
    { label: "< 0.3", count: 4 },
    { label: "0.3 - 0.4", count: 6 },
    { label: "0.4 - 0.5", count: 10 },
    { label: "0.5 - 0.6", count: 12 },
    { label: ">= 0.6", count: 8 },
  ],
  feedback: { regular: counts, noInfo: counts, all: counts },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// React Query publishes results on a zero-delay timeout by default; in tests it
// publishes at once, so a settled request is on screen when act returns.
notifyManager.setScheduler((callback) => callback());

async function settle(action: () => void) {
  await act(async () => action());
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function render() {
  act(() => root.render(
    <QueryClientProvider client={queryClient}>
      <QualityView isDemo={false} />
    </QueryClientProvider>
  ));
}

const skeleton = () => document.querySelector(".quality-body[aria-busy='true']");
const loadingStatus = () => document.querySelector("[role='status']")?.textContent;
const cardValues = () =>
  [...document.querySelectorAll(".quality-card-value")].map((el) => el.textContent);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // No retries, so a rejected request reaches the error state at once.
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  getQualitySummary.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
});

describe("QualityView loading state", () => {
  it("shows the skeleton while the first request is pending, then the metrics", async () => {
    const request = deferred<QualitySummary>();
    getQualitySummary.mockReturnValue(request.promise);
    render();

    expect(skeleton()).not.toBeNull();
    expect(loadingStatus()).toBe("Loading metrics…");
    // Same card layout as the loaded view, with placeholders for the numbers.
    expect(document.querySelectorAll(".quality-card")).toHaveLength(4);
    expect(document.querySelectorAll(".quality-bar-row")).toHaveLength(SUMMARY.buckets.length);
    expect(cardValues()).toEqual(["", "", "", ""]);

    await settle(() => request.resolve(SUMMARY));

    expect(skeleton()).toBeNull();
    expect(cardValues()[0]).toBe("42");
    expect(document.querySelector(".quality-status")).toBeNull();
  });

  it("replaces the skeleton with the existing error message when the request fails", async () => {
    const request = deferred<QualitySummary>();
    getQualitySummary.mockReturnValue(request.promise);
    render();
    expect(skeleton()).not.toBeNull();

    await settle(() => request.reject(new Error("Forbidden")));

    expect(skeleton()).toBeNull();
    expect(document.querySelector(".quality-status")?.textContent).toBe("Could not load metrics: Forbidden");
  });

  it("keeps the cached metrics on screen during a background refetch", async () => {
    queryClient.setQueryData(["qualitySummary", 7], SUMMARY);
    const refetch = deferred<QualitySummary>();
    getQualitySummary.mockReturnValue(refetch.promise);
    render();

    await settle(() => { void queryClient.invalidateQueries({ queryKey: ["qualitySummary"] }); });

    expect(queryClient.isFetching({ queryKey: ["qualitySummary", 7] })).toBe(1);
    expect(skeleton()).toBeNull();
    expect(cardValues()[0]).toBe("42");

    await settle(() => refetch.resolve({ ...SUMMARY, questions: 43 }));
    expect(cardValues()[0]).toBe("43");
  });
});
