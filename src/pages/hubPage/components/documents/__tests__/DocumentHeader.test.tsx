import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DocumentHeader } from "../DocumentHeader";
import type { DownloadFormat } from "../../../../../api/documentsClient";

let container: HTMLDivElement;
let root: Root;
const onDownload = vi.fn<(format: DownloadFormat) => void>();

const editActions = { onSave: () => {}, onCancel: () => {}, canSave: false, isSaving: false };
const downloadBtn = () => document.querySelector<HTMLButtonElement>('[aria-label="Export document"]');
const menuItems = () => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];

function render(props: Partial<Parameters<typeof DocumentHeader>[0]> = {}) {
  act(() => root.render(
    <DocumentHeader title="Handbook" isCreating={false} onCancel={() => {}} onDownload={onDownload} {...props} />,
  ));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  onDownload.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("DocumentHeader download menu", () => {
  it("opens a menu with Markdown, PDF and Word", () => {
    render();
    expect(menuItems()).toHaveLength(0);

    act(() => downloadBtn()!.click());

    expect(downloadBtn()!.getAttribute("aria-expanded")).toBe("true");
    expect(menuItems().map((b) => b.textContent)).toEqual(["Markdown (.md)", "PDF (.pdf)", "Word (.docx)"]);
  });

  it.each([
    [0, "md"],
    [1, "pdf"],
    [2, "docx"],
  ] as const)("item %i downloads %s and closes the menu", async (index, format) => {
    render();
    act(() => downloadBtn()!.click());

    await act(async () => menuItems()[index]!.click());

    expect(onDownload).toHaveBeenCalledExactlyOnceWith(format);
    expect(menuItems()).toHaveLength(0);
  });

  it("is disabled while editing, with a hint", () => {
    render({ editActions });
    expect(downloadBtn()!.disabled).toBe(true);
    expect(downloadBtn()!.dataset.tooltip).toBe("Save or cancel your changes first");
  });

  it("is hidden while creating a document", () => {
    render({ isCreating: true });
    expect(downloadBtn()).toBeNull();
  });
});
