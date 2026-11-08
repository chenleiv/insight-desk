import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusContext, type StatusApi } from "../../../../../components/statusBar/statusContext";
import { ConfirmContext, type ConfirmFn } from "../../../../../components/confirmModal/confirmContext";
import DocumentPane from "../DocumentPane";

type Extracted = { text: string; fileName: string };

const { extractTextFromFile } = vi.hoisted(() => ({
  extractTextFromFile: vi.fn<(file: File) => Promise<Extracted>>(),
}));

vi.mock("../../../../../api/documentsClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../api/documentsClient")>()),
  extractTextFromFile,
}));

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

const importBtn = () => document.querySelector<HTMLButtonElement>(".doc-pane-import-btn")!;
const discardBtn = () => document.querySelector<HTMLButtonElement>(".doc-pane-cancel-btn")!;
const picker = () => document.querySelector<HTMLInputElement>('input[type="file"][accept^=".json"]')!;

function pick(name: string) {
  Object.defineProperty(picker(), "files", { configurable: true, value: [new File(["x"], name)] });
  picker().dispatchEvent(new Event("change", { bubbles: true }));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", memoryStorage());
  localStorage.setItem("insight-desk:new-doc-toured", "1");
  extractTextFromFile.mockReset();
  vi.mocked(status.show).mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(
    <QueryClientProvider client={new QueryClient()}>
      <StatusContext.Provider value={status}>
        <ConfirmContext.Provider value={confirm}>
          <DocumentPane doc={null} canEdit isCreating onCancelCreate={() => {}} onCreated={() => {}} onSaved={() => {}} hasDocs />
        </ConfirmContext.Provider>
      </StatusContext.Provider>
    </QueryClientProvider>,
  ));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("importing text into a new document", () => {
  it("shows the wait on the button and holds the form until the text arrives", async () => {
    const request = deferred<Extracted>();
    extractTextFromFile.mockReturnValue(request.promise);

    await act(async () => pick("report.pdf"));

    expect(importBtn().textContent).toBe("Importing text…");
    expect(importBtn().disabled).toBe(true);
    expect(importBtn().getAttribute("aria-busy")).toBe("true");
    expect(discardBtn().disabled).toBe(true);

    await act(async () => request.resolve({ text: "Body", fileName: "report.pdf" }));

    expect(importBtn().textContent).toBe("Import text from file");
    expect(importBtn().disabled).toBe(false);
    expect(discardBtn().disabled).toBe(false);
    expect(status.show).toHaveBeenCalledWith({ kind: "success", message: "Text imported." });
  });

  it("sends one request when a second file is chosen during the wait", async () => {
    const request = deferred<Extracted>();
    extractTextFromFile.mockReturnValue(request.promise);

    await act(async () => { pick("a.pdf"); pick("b.pdf"); });

    expect(extractTextFromFile).toHaveBeenCalledOnce();
    await act(async () => request.resolve({ text: "Body", fileName: "a.pdf" }));
  });

  it("is ready again and shows the error when the extraction fails", async () => {
    const request = deferred<Extracted>();
    extractTextFromFile.mockReturnValue(request.promise);

    await act(async () => pick("broken.pdf"));
    await act(async () => request.reject(new Error("Could not read it")));

    expect(importBtn().disabled).toBe(false);
    expect(importBtn().textContent).toBe("Import text from file");
    expect(status.show).toHaveBeenCalledWith({ kind: "error", title: "Import failed", message: "Could not read it" });
  });
});
