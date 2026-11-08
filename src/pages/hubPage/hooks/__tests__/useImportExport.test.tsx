import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusContext, type StatusApi } from "../../../../components/statusBar/statusContext";
import type { DocumentInput, DocumentItem } from "../../../../api/documentsClient";
import { useImportExport } from "../useImportExport";

type ImportResult = { inserted: number; mode: "append" | "replace" };

const { exportDocuments, importDocumentsBulk, parseImportFiles } = vi.hoisted(() => ({
  exportDocuments: vi.fn<() => Promise<DocumentItem[]>>(),
  importDocumentsBulk: vi.fn<() => Promise<ImportResult>>(),
  parseImportFiles: vi.fn<(files: File[]) => Promise<Partial<DocumentInput>[]>>(),
}));

vi.mock("../../../../api/documentsClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/documentsClient")>()),
  exportDocuments,
  importDocumentsBulk,
}));
vi.mock("../../utils/parseImportFile", () => ({ parseImportFiles }));

const COMPLETE: DocumentInput = { title: "T", category: "C", content: "Body" };
const status: StatusApi = { show: vi.fn(), clear: vi.fn() };

let api: ReturnType<typeof useImportExport>;
let container: HTMLDivElement;
let root: Root;

// Hands the hook's latest value to the test on every render.
function Probe({ expose }: { expose: (value: ReturnType<typeof useImportExport>) => void }) {
  expose(useImportExport());
  return null;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** Starts an import and answers the file picker with one file. */
async function pickFile() {
  let picker!: HTMLInputElement;
  const realCreate = document.createElement.bind(document);
  const create = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = realCreate(tag);
    if (tag === "input") {
      picker = el as HTMLInputElement;
      vi.spyOn(picker, "click").mockImplementation(() => {});
    }
    return el;
  });
  act(() => api.handleImport("append", "text"));
  create.mockRestore();
  Object.defineProperty(picker, "files", { value: [new File(["x"], "a.md")] });
  await act(async () => { void picker.onchange?.({ target: picker } as unknown as Event); });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  exportDocuments.mockReset();
  importDocumentsBulk.mockReset();
  parseImportFiles.mockReset();
  vi.mocked(status.show).mockClear();
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root.render(
    <QueryClientProvider client={new QueryClient()}>
      <StatusContext.Provider value={status}>
        <Probe expose={(value) => { api = value; }} />
      </StatusContext.Provider>
    </QueryClientProvider>,
  ));
});

afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
});

describe("bulk export", () => {
  it("is pending until the file is ready and sends one request for a double click", async () => {
    const request = deferred<DocumentItem[]>();
    exportDocuments.mockReturnValue(request.promise);

    act(() => { void api.handleExport(); void api.handleExport(); });
    expect(exportDocuments).toHaveBeenCalledOnce();
    expect(api.isExporting).toBe(true);

    await act(async () => request.resolve([]));

    expect(api.isExporting).toBe(false);
    expect(status.show).toHaveBeenCalledWith({ kind: "success", message: "Documents exported." });
  });

  it("clears the pending state and shows the error on failure", async () => {
    exportDocuments.mockRejectedValue(new Error("Forbidden"));

    await act(async () => { await api.handleExport(); });

    expect(api.isExporting).toBe(false);
    expect(status.show).toHaveBeenCalledWith({ kind: "error", title: "Export failed", message: "Forbidden" });
  });
});

describe("bulk import", () => {
  it("is pending while sending and sends one request for a double submit", async () => {
    const request = deferred<ImportResult>();
    importDocumentsBulk.mockReturnValue(request.promise);

    let first!: Promise<void>;
    act(() => { first = api.doImport("append", [COMPLETE]); void api.doImport("append", [COMPLETE]); });
    expect(importDocumentsBulk).toHaveBeenCalledOnce();
    expect(api.isImporting).toBe(true);

    await act(async () => { request.resolve({ inserted: 1, mode: "append" }); await first; });

    expect(api.isImporting).toBe(false);
    expect(status.show).toHaveBeenCalledWith({ kind: "success", message: "Imported 1 documents." });
  });

  it("clears the pending state and passes the failure on to the preview dialog's handler", async () => {
    importDocumentsBulk.mockRejectedValue(new Error("Too large"));

    await act(async () => {
      await expect(api.doImport("append", [COMPLETE])).rejects.toThrow("Too large");
    });

    expect(api.isImporting).toBe(false);
  });

  it("is pending from the moment a file is picked, and ends when it fails", async () => {
    const parsing = deferred<Partial<DocumentInput>[]>();
    parseImportFiles.mockReturnValue(parsing.promise);

    await pickFile();
    expect(api.isImporting).toBe(true);

    await act(async () => parsing.reject(new Error("Bad file")));

    expect(api.isImporting).toBe(false);
    expect(status.show).toHaveBeenCalledWith({ kind: "error", title: "Import failed", message: "Bad file" });
  });

  it("stops being pending when the file needs the preview dialog", async () => {
    parseImportFiles.mockResolvedValue([{ title: "No body" }]);

    await pickFile();

    expect(api.isImporting).toBe(false);
    expect(api.importPreview?.docs).toEqual([{ title: "No body" }]);
    expect(importDocumentsBulk).not.toHaveBeenCalled();
  });

  it("sends a complete file at once", async () => {
    parseImportFiles.mockResolvedValue([COMPLETE]);
    importDocumentsBulk.mockResolvedValue({ inserted: 1, mode: "append" });

    await pickFile();

    expect(importDocumentsBulk).toHaveBeenCalledOnce();
    expect(api.isImporting).toBe(false);
  });
});
