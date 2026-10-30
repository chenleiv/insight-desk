import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusContext, type StatusApi } from "../../../../../components/statusBar/statusContext";
import { ConfirmContext, type ConfirmFn } from "../../../../../components/confirmModal/confirmContext";
import type { Attachment, DocumentInput, DocumentItem } from "../../../../../api/documentsClient";
import DocumentPane from "../DocumentPane";

const { updateDocument, uploadAttachment } = vi.hoisted(() => ({
  updateDocument: vi.fn<(id: string, input: DocumentInput) => Promise<DocumentItem>>(),
  uploadAttachment: vi.fn<(id: string, file: File) => Promise<Attachment>>(),
}));

vi.mock("../../../../../api/documentsClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../api/documentsClient")>()),
  updateDocument,
  uploadAttachment,
}));

const DOC_A: DocumentItem = {
  id: "a",
  title: "Handbook",
  category: "HR",
  content: "Hello",
  attachments: [
    { _id: "att-1", url: "", gridfsId: "g-1", fileName: "policy.pdf", fileType: "application/pdf", extractedText: "Policy" },
  ],
};
const DOC_B: DocumentItem = { id: "b", title: "Notes", category: "Misc", content: "Other" };

const status: StatusApi = { show: vi.fn(), clear: vi.fn() };
const confirm = vi.fn<ConfirmFn>();
const onDirtyChange = vi.fn<(dirty: boolean) => void>();

let container: HTMLDivElement;
let root: Root;

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

// Holds the document the way the hub does: a save replaces it with the server's copy.
type HarnessProps = {
  initial: DocumentItem;
  canEdit?: boolean;
  onDelete?: (doc: DocumentItem) => void;
  onClose?: () => void;
};

function Harness({ initial, canEdit = true, onDelete, onClose }: HarnessProps) {
  const [doc, setDoc] = useState(initial);
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
    <StatusContext.Provider value={status}>
      <ConfirmContext.Provider value={confirm}>
        <DocumentPane
          doc={doc}
          canEdit={canEdit}
          isCreating={false}
          onCancelCreate={() => {}}
          onCreated={() => {}}
          onSaved={setDoc}
          hasDocs
          onDirtyChange={onDirtyChange}
          {...(onDelete && { onDelete })}
          {...(onClose && { onClose })}
        />
      </ConfirmContext.Provider>
    </StatusContext.Provider>
    </QueryClientProvider>
  );
}

function render(ui: React.ReactNode) {
  act(() => root.render(ui));
}

const content = () => document.querySelector<HTMLTextAreaElement>(".notion-content-input")!;
const editBtn = () => document.querySelector<HTMLButtonElement>(".doc-pane-edit-btn");
const statusText = () => document.querySelector(".doc-pane-save-status")?.textContent;
const savedContents = () => updateDocument.mock.calls.map(([, input]) => input.content);

// Sets the value the way the browser does on typing, so React's onChange fires.
function type(value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(content(), value);
    content().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const saveBtn = () => document.querySelector<HTMLButtonElement>(".doc-pane-save-edit-btn");
const cancelBtn = () => document.querySelector<HTMLButtonElement>(".doc-pane-cancel-edit-btn");

async function click(button: HTMLButtonElement | null) {
  await act(async () => button!.click());
}

async function wait(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

function deferred() {
  let resolve!: (doc: DocumentItem) => void;
  const promise = new Promise<DocumentItem>((res) => { resolve = res; });
  return { promise, resolve };
}

const serverCopy = (id: string, input: DocumentInput): DocumentItem => ({ ...DOC_A, ...input, id });

// jsdom has no scrolling; the editor scrolls its body on mount.
Element.prototype.scrollTo ??= () => {};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("localStorage", memoryStorage());
  localStorage.setItem("insight-desk:doc-toured", "1");
  updateDocument.mockReset();
  updateDocument.mockImplementation(async (id, input) => serverCopy(id, input));
  uploadAttachment.mockReset();
  vi.mocked(status.show).mockReset();
  confirm.mockReset();
  onDirtyChange.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("DocumentPane read and edit modes", () => {
  it("opens an existing document read-only, with an Edit button and no Save or Cancel", () => {
    render(<Harness initial={DOC_A} />);
    expect(content().readOnly).toBe(true);
    expect(document.querySelector<HTMLInputElement>(".notion-title-input")!.readOnly).toBe(true);
    expect(editBtn()!.textContent).toBe("Edit");
    expect(saveBtn()).toBeNull();
    expect(cancelBtn()).toBeNull();
  });

  it("gives a viewer no Edit button", () => {
    render(<Harness initial={DOC_A} canEdit={false} />);
    expect(editBtn()).toBeNull();
    expect(content().readOnly).toBe(true);
  });

  it("Edit unlocks the fields and shows Save and Cancel in its place", async () => {
    render(<Harness initial={DOC_A} />);
    await click(editBtn());
    expect(content().readOnly).toBe(false);
    expect(editBtn()).toBeNull();
    expect(cancelBtn()!.disabled).toBe(false);
    expect(saveBtn()!.disabled).toBe(true);
  });

  it("disables export and delete while editing, but not close", async () => {
    render(<Harness initial={DOC_A} onDelete={() => {}} onClose={() => {}} />);
    const exportBtn = () => document.querySelector<HTMLButtonElement>('[aria-label="Export document"]')!;
    const deleteBtn = () => document.querySelector<HTMLButtonElement>('[aria-label="Delete"]')!;
    const closeBtn = () => document.querySelector<HTMLButtonElement>('[aria-label="Close document"]')!;
    expect([exportBtn().disabled, deleteBtn().disabled, closeBtn().disabled]).toEqual([false, false, false]);

    await click(editBtn());
    expect([exportBtn().disabled, deleteBtn().disabled, closeBtn().disabled]).toEqual([true, true, false]);

    await click(cancelBtn());
    expect([exportBtn().disabled, deleteBtn().disabled]).toEqual([false, false]);
  });

  it("lets an editor open, add and remove attachments in read mode too", () => {
    render(<Harness initial={DOC_A} />);
    const open = document.querySelector<HTMLAnchorElement>('.notion-att-chips a[title="Open"]')!;
    expect(open.getAttribute("href")).toContain("/api/documents/a/attachments/att-1/file");
    expect(document.querySelector('.notion-att-chips button[title="Remove"]')).not.toBeNull();
    expect(document.querySelector(".notion-att-chip--add")).not.toBeNull();
  });

  it("uploads a file in read mode without switching to edit mode", async () => {
    const file = new File(["text"], "notes.txt", { type: "text/plain" });
    uploadAttachment.mockResolvedValue({ _id: "att-2", url: "", gridfsId: "g-2", fileName: "notes.txt", fileType: "text/plain" });
    render(<Harness initial={DOC_A} />);
    const input = document.querySelector<HTMLInputElement>('.notion-doc-body input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [file] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(uploadAttachment).toHaveBeenCalledWith("a", file);
    expect(document.querySelector(".notion-att-chips")!.textContent).toContain("notes.txt");
    expect(content().readOnly).toBe(true);
    expect(updateDocument).not.toHaveBeenCalled();
  });

  it("shows a viewer attachments as links only", () => {
    render(<Harness initial={DOC_A} canEdit={false} />);
    expect(document.querySelector(".notion-att-chips a")?.textContent).toBe("policy.pdf");
    expect(document.querySelector('.notion-att-chips button[title="Remove"]')).toBeNull();
    expect(document.querySelector(".notion-att-chip--add")).toBeNull();
  });

  it("opens another document read-only even while one was being edited", async () => {
    render(<Harness key="a" initial={DOC_A} />);
    await click(editBtn());
    render(<Harness key="b" initial={DOC_B} />);
    expect(content().value).toBe("Other");
    expect(content().readOnly).toBe(true);
    expect(editBtn()).not.toBeNull();
  });
});

describe("DocumentPane Save", () => {
  it("never saves on typing alone, however long the pause", async () => {
    render(<Harness initial={DOC_A} />);
    await click(editBtn());
    type("Hello there");
    await wait(60_000);
    expect(updateDocument).not.toHaveBeenCalled();
  });

  it("sends one request and returns to read mode", async () => {
    render(<Harness initial={DOC_A} />);
    await click(editBtn());
    type("Hello there");
    await click(saveBtn());
    expect(savedContents()).toEqual(["Hello there"]);
    expect(content().readOnly).toBe(true);
    expect(content().value).toBe("Hello there");
  });

  it("sends one request when Save is clicked twice quickly", async () => {
    render(<Harness initial={DOC_A} />);
    await click(editBtn());
    type("Hello there");
    await act(async () => {
      saveBtn()!.click();
      saveBtn()!.click();
    });
    expect(updateDocument).toHaveBeenCalledTimes(1);
    expect(content().readOnly).toBe(true);
  });

  it("is disabled while a required field is empty", async () => {
    render(<Harness initial={DOC_A} />);
    await click(editBtn());
    type("");
    expect(saveBtn()!.disabled).toBe(true);
  });

  it("keeps text typed during a save and saves it with the next Save", async () => {
    const first = deferred();
    updateDocument.mockImplementationOnce(() => first.promise);
    render(<Harness initial={DOC_A} />);
    await click(editBtn());
    type("Hello 1");
    await click(saveBtn());
    expect(saveBtn()!.disabled).toBe(true);
    expect(cancelBtn()!.disabled).toBe(true);

    type("Hello 12");
    await act(async () => first.resolve(serverCopy("a", { ...DOC_A, content: "Hello 1" })));
    expect(content().value).toBe("Hello 12");
    expect(content().readOnly).toBe(false);
    expect(statusText()).toBe("Unsaved changes");

    await click(saveBtn());
    expect(savedContents()).toEqual(["Hello 1", "Hello 12"]);
    expect(content().readOnly).toBe(true);
  });

  it("stays in edit mode and reports a failed save", async () => {
    updateDocument.mockRejectedValueOnce(new Error("Network down"));
    render(<Harness initial={DOC_A} />);
    await click(editBtn());
    type("Hello there");
    await click(saveBtn());
    expect(statusText()).toBe("Save failed");
    expect(content().readOnly).toBe(false);
    expect(content().value).toBe("Hello there");
    expect(status.show).toHaveBeenCalledWith(expect.objectContaining({ title: "Save failed" }));
  });

  it("shows unsaved, saving and saved states", async () => {
    const save = deferred();
    updateDocument.mockImplementationOnce(() => save.promise);
    render(<Harness initial={DOC_A} />);
    await click(editBtn());
    expect(statusText()).toBe("");
    type("Hello there");
    expect(statusText()).toBe("Unsaved changes");
    await click(saveBtn());
    expect(statusText()).toBe("Saving…");
    await act(async () => save.resolve(serverCopy("a", { ...DOC_A, content: "Hello there" })));
    expect(statusText()).toBe("Saved");
    expect(document.querySelector(".doc-pane-save-status")!.getAttribute("aria-live")).toBe("polite");
  });

  it("reports unsaved changes to the guard until they are saved", async () => {
    render(<Harness initial={DOC_A} />);
    await click(editBtn());
    type("Hello there");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await click(saveBtn());
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});

describe("DocumentPane Cancel", () => {
  it("returns to read mode at once when nothing changed", async () => {
    render(<Harness initial={DOC_A} />);
    await click(editBtn());
    await click(cancelBtn());
    expect(confirm).not.toHaveBeenCalled();
    expect(content().readOnly).toBe(true);
  });

  it("asks first, then discards the changes and returns to read mode", async () => {
    confirm.mockResolvedValue(true);
    render(<Harness initial={DOC_A} />);
    await click(editBtn());
    type("Hello there");
    await click(cancelBtn());
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(content().value).toBe("Hello");
    expect(content().readOnly).toBe(true);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(updateDocument).not.toHaveBeenCalled();
  });

  it("keeps editing with the changes when the discard is declined", async () => {
    confirm.mockResolvedValue(false);
    render(<Harness initial={DOC_A} />);
    await click(editBtn());
    type("Hello there");
    await click(cancelBtn());
    expect(content().value).toBe("Hello there");
    expect(content().readOnly).toBe(false);
  });
});

describe("DocumentPane Escape key", () => {
  const hubEscape = vi.fn<() => void>();
  const onHubKey = (e: KeyboardEvent) => { if (e.key === "Escape") hubEscape(); };

  beforeEach(() => {
    hubEscape.mockReset();
    window.addEventListener("keydown", onHubKey);
  });
  afterEach(() => window.removeEventListener("keydown", onHubKey));

  async function pressEscape() {
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
  }

  it("in edit mode, cancels like the Cancel button without closing the pane", async () => {
    confirm.mockResolvedValue(true);
    render(<Harness initial={DOC_A} />);
    await click(editBtn());
    type("Hello there");
    await pressEscape();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(content().value).toBe("Hello");
    expect(content().readOnly).toBe(true);
    expect(hubEscape).not.toHaveBeenCalled();
  });

  it("in read mode, is left to the hub", async () => {
    render(<Harness initial={DOC_A} />);
    await pressEscape();
    expect(hubEscape).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
  });
});
