import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DocumentHeader } from "../DocumentHeader";
import type { DownloadFormat } from "../../../../../api/documentsClient";

const { screen } = vi.hoisted(() => ({ screen: { isMobile: true } }));
vi.mock("../../../../../hooks/useMobile", () => ({ useMobile: () => screen.isMobile }));

let container: HTMLDivElement;
let root: Root;
const onDownload = vi.fn<(format: DownloadFormat) => void>();
const onDelete = vi.fn();
const onClose = vi.fn();

const editActions = { onSave: () => {}, onCancel: () => {}, canSave: false, isSaving: false };
const button = (label: string) => document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
const back = () => button("Back");
const more = () => button("More actions");
const menuItems = () => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
const menuItem = (label: string) => menuItems().find((b) => b.textContent === label)!;

function render(props: Partial<Parameters<typeof DocumentHeader>[0]> = {}) {
  act(() => root.render(
    <DocumentHeader isCreating={false} onClose={onClose} {...props} />,
  ));
}

const readMode = { onEdit: () => {}, onDownload, onDelete };

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  screen.isMobile = true;
  onDownload.mockReset();
  onDelete.mockReset();
  onClose.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("DocumentHeader while a download runs", () => {
  const chip = () => document.querySelector(".doc-pane-save-status")?.textContent;

  it("on a phone, shows it in the chip because the More menu has closed, and blocks the formats", () => {
    render({ ...readMode, isDownloading: true });
    expect(chip()).toBe("Downloading…");

    act(() => more()!.click());
    expect(menuItem("Export as PDF (.pdf)").disabled).toBe(true);
    expect(menuItem("Export as Word (.docx)").disabled).toBe(true);
    expect(menuItem("Delete").disabled).toBe(false);
  });

  it("on desktop, shows the chip and disables the export button", () => {
    screen.isMobile = false;
    render({ ...readMode, isDownloading: true });
    expect(chip()).toBe("Downloading…");
    expect(button("Export document")!.disabled).toBe(true);
    expect(button("Export document")!.getAttribute("aria-busy")).toBe("true");
  });

  it("offers the formats again when it ends", () => {
    render({ ...readMode, isDownloading: false });
    expect(chip()).toBeUndefined();
    act(() => more()!.click());
    expect(menuItem("Export as PDF (.pdf)").disabled).toBe(false);
  });
});

describe("DocumentHeader on phones", () => {
  it("has Back, Edit and a menu instead of Close, Export and Delete", () => {
    render(readMode);
    expect(back()).not.toBeNull();
    expect(document.querySelector(".doc-pane-edit-btn")).not.toBeNull();
    expect(more()).not.toBeNull();
    expect(button("Close document")).toBeNull();
    expect(button("Export document")).toBeNull();
    expect(button("Delete")).toBeNull();
  });

  it("puts Back before the other actions", () => {
    render(readMode);
    expect(back()!.parentElement!.firstElementChild).toBe(back());
    expect(back()!.closest(".doc-pane-actions")).toBeNull();
  });

  it("leaves through onClose", () => {
    render(readMode);
    act(() => back()!.click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("lists the exports and Delete in the menu", () => {
    render(readMode);
    expect(menuItems()).toHaveLength(0);
    act(() => more()!.click());
    expect(more()!.getAttribute("aria-expanded")).toBe("true");
    expect(menuItems().map((b) => b.textContent)).toEqual([
      "Export as Markdown (.md)", "Export as PDF (.pdf)", "Export as Word (.docx)", "Delete",
    ]);
    expect(menuItem("Delete").classList.contains("danger")).toBe(true);
  });

  it.each([
    ["Export as Markdown (.md)", "md"],
    ["Export as PDF (.pdf)", "pdf"],
    ["Export as Word (.docx)", "docx"],
  ] as const)("%s exports %s and closes the menu", async (label, format) => {
    render(readMode);
    act(() => more()!.click());
    await act(async () => menuItem(label).click());
    expect(onDownload).toHaveBeenCalledExactlyOnceWith(format);
    expect(menuItems()).toHaveLength(0);
  });

  it("closes the menu at once when Delete asks for confirmation", async () => {
    onDelete.mockReturnValue(new Promise(() => {}));
    render(readMode);
    act(() => more()!.click());
    await act(async () => menuItem("Delete").click());
    expect(onDelete).toHaveBeenCalledOnce();
    expect(menuItems()).toHaveLength(0);
  });

  it("closes the menu on a second tap of its button, without reopening it", () => {
    render(readMode);
    act(() => more()!.click());
    act(() => {
      more()!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      more()!.click();
    });
    expect(menuItems()).toHaveLength(0);
    act(() => more()!.click());
    expect(menuItems()).toHaveLength(4);
  });

  it("offers only the exports to a viewer", () => {
    render({ onDownload });
    act(() => more()!.click());
    expect(menuItems().map((b) => b.textContent)).not.toContain("Delete");
    expect(menuItems()).toHaveLength(3);
  });

  it("replaces Edit and the menu with Cancel and Save while editing", () => {
    render({ editActions, onDownload, onDelete });
    expect(document.querySelector(".doc-pane-cancel-edit-btn")).not.toBeNull();
    expect(document.querySelector(".doc-pane-save-edit-btn")).not.toBeNull();
    expect(document.querySelector(".doc-pane-edit-btn")).toBeNull();
    expect(more()).toBeNull();
    expect(back()!.disabled).toBe(false);
  });

  it("has Back and Import on the new-document form, and no menu", () => {
    render({ isCreating: true, onImportClick: () => {} });
    expect(back()).not.toBeNull();
    expect(document.querySelector(".doc-pane-import-btn")).not.toBeNull();
    expect(more()).toBeNull();
  });

  it.each([
    ["the document is being deleted", { ...readMode, isDeleting: true }],
    ["the edit is being saved", { editActions: { ...editActions, isSaving: true } }],
    ["the document is being created", { isCreating: true, onImportClick: () => {}, importDisabled: true }],
  ])("keeps Back disabled while %s", (_name, props) => {
    render(props);
    expect(back()!.disabled).toBe(true);
  });

  it("disables Delete in the menu and shows Deleting… while the document is deleted", () => {
    render({ ...readMode, isDeleting: true, saveStatus: "idle" });
    act(() => more()!.click());
    expect(menuItem("Delete").disabled).toBe(true);
    expect(menuItem("Export as PDF (.pdf)").disabled).toBe(false);
    expect(document.querySelector(".doc-pane-save-status")!.textContent).toBe("Deleting…");
  });
});

describe("DocumentHeader on wider screens", () => {
  it("keeps Close, Export and Delete, with no Back or menu", () => {
    screen.isMobile = false;
    render(readMode);
    expect(button("Close document")).not.toBeNull();
    expect(button("Export document")).not.toBeNull();
    expect(button("Delete")).not.toBeNull();
    expect(back()).toBeNull();
    expect(more()).toBeNull();
  });
});
