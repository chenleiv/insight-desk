import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusContext, type StatusApi } from "../../../../../components/statusBar/statusContext";
import { ConfirmContext, type ConfirmFn } from "../../../../../components/confirmModal/confirmContext";
import type { Attachment, DocumentInput, DocumentItem } from "../../../../../api/documentsClient";
import { MAX_UPLOAD_BYTES } from "../../../../../../shared/uploadRules";
import DocumentPane from "../DocumentPane";

const { createDocument, deleteDocument, uploadAttachment } = vi.hoisted(() => ({
  createDocument: vi.fn<(input: DocumentInput) => Promise<DocumentItem>>(),
  deleteDocument: vi.fn<(id: string) => Promise<void>>(),
  uploadAttachment: vi.fn<(id: string, file: File) => Promise<Attachment>>(),
}));

vi.mock("../../../../../api/documentsClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../api/documentsClient")>()),
  createDocument,
  deleteDocument,
  uploadAttachment,
}));

const INPUT: DocumentInput = { title: "Plan", category: "Ops", content: "Steps" };
const status: StatusApi = { show: vi.fn(), clear: vi.fn() };
const confirm = vi.fn<ConfirmFn>();
const onCreated = vi.fn<(doc: DocumentItem) => void>();

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

function CreateHarness() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
    <StatusContext.Provider value={status}>
      <ConfirmContext.Provider value={confirm}>
        <DocumentPane
          doc={null}
          canEdit
          isCreating
          onCancelCreate={() => {}}
          onCreated={onCreated}
          onSaved={() => {}}
          hasDocs
        />
      </ConfirmContext.Provider>
    </StatusContext.Provider>
    </QueryClientProvider>
  );
}

let container: HTMLDivElement;
let root: Root;

const field = (name: keyof DocumentInput) =>
  document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
const createBtn = () => document.querySelector<HTMLButtonElement>(".doc-pane-create-btn")!;
const pendingChips = () =>
  [...document.querySelectorAll(".notion-att-chip--pending .notion-att-chip-name")].map((el) => el.textContent);

function fill(input: DocumentInput) {
  act(() => {
    for (const [name, value] of Object.entries(input)) {
      const el = field(name as keyof DocumentInput);
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
}

function attach(file: File) {
  const input = document.querySelector<HTMLInputElement>(".notion-doc-body input[type=file]")!;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  act(() => { input.dispatchEvent(new Event("change", { bubbles: true })); });
}

async function submit() {
  await act(async () => createBtn().click());
}

const sized = (name: string, type: string, size: number) => {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

// jsdom has no scrolling; the editor scrolls its body on mount.
Element.prototype.scrollTo ??= () => {};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", memoryStorage());
  localStorage.setItem("insight-desk:doc-toured", "1");
  localStorage.setItem("insight-desk:new-doc-toured", "1");
  createDocument.mockReset();
  let next = 0;
  createDocument.mockImplementation(async (input) => ({ ...input, id: `new-${++next}` }));
  deleteDocument.mockReset();
  deleteDocument.mockResolvedValue(undefined);
  uploadAttachment.mockReset();
  vi.mocked(status.show).mockReset();
  onCreated.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<CreateHarness />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("DocumentPane create with files that fail", () => {
  it("does not queue a file the server would reject, and says why", () => {
    attach(sized("big.pdf", "application/pdf", MAX_UPLOAD_BYTES + 1));
    attach(new File(["x"], "page.html", { type: "text/html" }));

    expect(pendingChips()).toEqual([]);
    expect(status.show).toHaveBeenCalledWith(expect.objectContaining({
      kind: "error", message: "File is too large. The maximum size is 10MB.",
    }));
    expect(status.show).toHaveBeenCalledWith(expect.objectContaining({
      kind: "error", message: 'File type "text/html" is not allowed',
    }));
  });

  it("queues a .md file the browser gave no type", () => {
    attach(new File(["# Notes"], "notes.md", { type: "" }));
    expect(pendingChips()).toEqual(["notes.md"]);
  });

  it("deletes the new document when an upload fails, so a retry creates only one", async () => {
    const first: Attachment = { _id: "att-1", url: "", fileName: "a.txt", fileType: "text/plain" };
    uploadAttachment
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error("Upload failed"));
    fill(INPUT);
    attach(new File(["a"], "a.txt", { type: "text/plain" }));
    attach(new File(["b"], "b.txt", { type: "text/plain" }));

    await submit();

    expect(deleteDocument).toHaveBeenCalledWith("new-1");
    expect(onCreated).not.toHaveBeenCalled();
    expect(status.show).toHaveBeenCalledWith(expect.objectContaining({
      kind: "error",
      title: "Creation failed",
      message: 'Document was not created: "b.txt" could not be uploaded. Upload failed',
    }));
    // The form keeps its fields and files for the retry.
    expect(field("title").value).toBe("Plan");
    expect(pendingChips()).toEqual(["a.txt", "b.txt"]);

    uploadAttachment.mockImplementation(async (_id, file) => ({ ...first, fileName: file.name }));
    await submit();

    expect(createDocument).toHaveBeenCalledTimes(2);
    expect(deleteDocument).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated.mock.calls[0]![0].id).toBe("new-2");
  });

  it("opens the document with the files that made it when the delete fails too", async () => {
    const first: Attachment = { _id: "att-1", url: "", fileName: "a.txt", fileType: "text/plain" };
    uploadAttachment
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error("Network down"));
    deleteDocument.mockRejectedValueOnce(new Error("Network down"));
    fill(INPUT);
    attach(new File(["a"], "a.txt", { type: "text/plain" }));
    attach(new File(["b"], "b.txt", { type: "text/plain" }));

    await submit();

    expect(onCreated).toHaveBeenCalledWith({ ...INPUT, id: "new-1", attachments: [first] });
    expect(status.show).toHaveBeenCalledWith(expect.objectContaining({
      kind: "error",
      title: "Attachment failed",
      message: 'Document created, but "b.txt" was not attached. Attach it again from the document.',
    }));
  });
});
