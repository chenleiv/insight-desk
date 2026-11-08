import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusContext, type StatusApi } from "../../../../../components/statusBar/statusContext";
import { ConfirmContext, type ConfirmFn } from "../../../../../components/confirmModal/confirmContext";
import type { DocumentItem, DownloadFormat } from "../../../../../api/documentsClient";
import DocumentPane from "../DocumentPane";

type DownloadResult = { blob: Blob; fileName: string };

const { downloadDocument } = vi.hoisted(() => ({
  downloadDocument: vi.fn<(id: string, format: DownloadFormat) => Promise<DownloadResult>>(),
}));

vi.mock("../../../../../api/documentsClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../api/documentsClient")>()),
  downloadDocument,
}));

const DOC: DocumentItem = { id: "a", title: "Handbook", category: "HR", content: "Hello" };
const status: StatusApi = { show: vi.fn(), clear: vi.fn() };
const confirm = vi.fn<ConfirmFn>();

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

// jsdom has no scrolling; the editor scrolls its body on mount.
Element.prototype.scrollTo ??= () => {};

let container: HTMLDivElement;
let root: Root;

const exportBtn = () => document.querySelector<HTMLButtonElement>('[aria-label="Export document"]')!;
const chip = () => document.querySelector(".doc-pane-save-status")?.textContent;
const pdfItem = () =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => b.textContent === "PDF (.pdf)")!;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", memoryStorage());
  localStorage.setItem("insight-desk:doc-toured", "1");
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  downloadDocument.mockReset();
  vi.mocked(status.show).mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(
    <QueryClientProvider client={new QueryClient()}>
      <StatusContext.Provider value={status}>
        <ConfirmContext.Provider value={confirm}>
          <DocumentPane doc={DOC} canEdit isCreating={false} onCancelCreate={() => {}} onCreated={() => {}} onSaved={() => {}} hasDocs />
        </ConfirmContext.Provider>
      </StatusContext.Provider>
    </QueryClientProvider>,
  ));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DocumentPane download", () => {
  it("shows the wait, blocks a double click, and clears when the file is ready", async () => {
    const request = deferred<DownloadResult>();
    downloadDocument.mockReturnValue(request.promise);

    act(() => exportBtn().click());
    const item = pdfItem();
    await act(async () => { item.click(); item.click(); });

    expect(downloadDocument).toHaveBeenCalledOnce();
    expect(chip()).toBe("Downloading…");
    expect(exportBtn().disabled).toBe(true);

    await act(async () => request.resolve({ blob: new Blob(["x"]), fileName: "a.pdf" }));

    expect(chip()).not.toBe("Downloading…");
    expect(exportBtn().disabled).toBe(false);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  });

  it("clears the wait and shows the error when the download fails", async () => {
    const request = deferred<DownloadResult>();
    downloadDocument.mockReturnValue(request.promise);

    act(() => exportBtn().click());
    const item = pdfItem();
    await act(async () => item.click());
    await act(async () => request.reject(new Error("Disk full")));

    expect(chip()).not.toBe("Downloading…");
    expect(exportBtn().disabled).toBe(false);
    expect(status.show).toHaveBeenCalledWith({ kind: "error", title: "Download failed", message: "Disk full" });
  });
});
