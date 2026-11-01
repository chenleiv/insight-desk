import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { StatusContext, type StatusApi } from "../../../../../components/statusBar/statusContext";
import { ConfirmContext, type ConfirmFn } from "../../../../../components/confirmModal/confirmContext";
import type { DocumentItem } from "../../../../../api/documentsClient";
import { DOCUMENTS_QUERY_KEY, useDocuments } from "../../../../../context/DocumentsContext";
import DocPanel from "../DocPanel";
import DocumentPane from "../DocumentPane";

const { listDocuments } = vi.hoisted(() => ({
  listDocuments: vi.fn<() => Promise<DocumentItem[]>>(),
}));

vi.mock("../../../../../api/documentsClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../api/documentsClient")>()),
  listDocuments,
}));

const DOCS: DocumentItem[] = [
  { id: "a", title: "Handbook", category: "HR", content: "Hello" },
  { id: "b", title: "Notes", category: "Misc", content: "Other" },
];

const status: StatusApi = { show: vi.fn(), clear: vi.fn() };
const confirm = vi.fn<ConfirmFn>();

// The pane reads localStorage to decide on its first-visit tour. Node's own global
// hides jsdom's here, so tests get a small in-memory one.
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

// Wires the list and the open document to the documents query the way the hub does.
function Hub({ activeDocId }: { activeDocId: string }) {
  const { docs, loading } = useDocuments();
  return (
    <>
      <DocPanel
        docs={docs}
        favorites={{}}
        activeDocId={activeDocId}
        onOpenDocument={() => {}}
        onNew={() => {}}
        canCreate
        onToggleFavorite={() => {}}
        loading={loading}
      />
      <DocumentPane
        doc={docs.find((d) => d.id === activeDocId) ?? null}
        canEdit
        isCreating={false}
        onCancelCreate={() => {}}
        onCreated={() => {}}
        onSaved={() => {}}
        hasDocs={docs.length > 0}
        loading={loading}
      />
    </>
  );
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function render() {
  act(() => root.render(
    <QueryClientProvider client={queryClient}>
      <StatusContext.Provider value={status}>
        <ConfirmContext.Provider value={confirm}>
          <Hub activeDocId="a" />
        </ConfirmContext.Provider>
      </StatusContext.Provider>
    </QueryClientProvider>
  ));
}

const listSkeleton = () => document.querySelector(".doc-panel-list[aria-busy='true']");
const docSkeleton = () => document.querySelector(".doc-detail-skeleton[aria-busy='true']");
const statusTexts = () => [...document.querySelectorAll("[role='status']")].map((el) => el.textContent);
const rowTitles = () => [...document.querySelectorAll(".doc-panel-row-title")].map((el) => el.textContent);
const titleInput = () => document.querySelector<HTMLInputElement>(".notion-title-input");

// jsdom has no scrolling; the editor scrolls its body on mount.
Element.prototype.scrollTo ??= () => {};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", memoryStorage());
  localStorage.setItem("insight-desk:doc-toured", "1");
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  listDocuments.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("document list and document view loading state", () => {
  it("shows both skeletons while the documents are pending, then the list and the document", async () => {
    const request = deferred<DocumentItem[]>();
    listDocuments.mockReturnValue(request.promise);
    render();

    expect(listSkeleton()).not.toBeNull();
    expect(docSkeleton()).not.toBeNull();
    expect(statusTexts()).toEqual(expect.arrayContaining(["Loading documents…", "Loading document…"]));
    expect(document.querySelectorAll(".doc-panel-row.skeleton-static")).toHaveLength(6);
    // The document skeleton uses the real header and body containers.
    expect(document.querySelector(".doc-detail-skeleton .doc-pane-top .doc-pane-actions")).not.toBeNull();
    expect(document.querySelector(".doc-detail-skeleton .notion-doc-body")).not.toBeNull();
    expect(document.querySelector(".doc-panel-empty")).toBeNull();

    await settle(() => request.resolve(DOCS));

    expect(listSkeleton()).toBeNull();
    expect(docSkeleton()).toBeNull();
    expect(rowTitles()).toEqual(["Handbook", "Notes"]);
    expect(titleInput()?.value).toBe("Handbook");
  });

  it("drops the skeletons and shows the existing empty states when the request fails", async () => {
    const request = deferred<DocumentItem[]>();
    listDocuments.mockReturnValue(request.promise);
    render();
    expect(listSkeleton()).not.toBeNull();

    await settle(() => request.reject(new Error("Network error")));

    expect(listSkeleton()).toBeNull();
    expect(docSkeleton()).toBeNull();
    expect(document.querySelector(".doc-panel-empty")?.textContent).toBe("No documents yet");
    expect(document.querySelector(".doc-pane-empty-title")?.textContent).toBe("No documents yet");
  });

  it("keeps the cached documents on screen during a background refetch", async () => {
    queryClient.setQueryData(DOCUMENTS_QUERY_KEY, DOCS);
    const refetch = deferred<DocumentItem[]>();
    listDocuments.mockReturnValue(refetch.promise);
    render();

    await settle(() => { void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY }); });

    expect(queryClient.isFetching({ queryKey: DOCUMENTS_QUERY_KEY })).toBe(1);
    expect(listSkeleton()).toBeNull();
    expect(docSkeleton()).toBeNull();
    expect(rowTitles()).toEqual(["Handbook", "Notes"]);
    expect(titleInput()?.value).toBe("Handbook");

    await settle(() => refetch.resolve(DOCS));
  });
});
