import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DocumentItem } from "../../../../../api/documentsClient";
import DocPanel from "../DocPanel";

const DOCS: DocumentItem[] = [
  { id: "1", title: "Firewall rules", category: "Security", content: "" },
  { id: "2", title: "Backup runbook", category: "Linux", content: "" },
];

let container: HTMLDivElement;
let root: Root;
const onOpenDocument = vi.fn();
const onToggleFavorite = vi.fn();

const stars = () => [...document.querySelectorAll<HTMLButtonElement>(".doc-panel-row-star-btn")];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  onOpenDocument.mockClear();
  onToggleFavorite.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(
    <DocPanel
      docs={DOCS}
      favorites={{}}
      activeDocId={null}
      onOpenDocument={onOpenDocument}
      onNew={() => {}}
      canCreate
      onToggleFavorite={onToggleFavorite}
      pendingFavorites={{ "1": true }}
    />,
  ));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("DocPanel favorite star", () => {
  it("marks only the document whose request is running as busy", () => {
    expect(stars().map((b) => b.getAttribute("aria-busy"))).toEqual(["true", "false"]);
    expect(stars().map((b) => b.getAttribute("aria-disabled"))).toEqual(["true", "false"]);
  });

  it("does not open the document when a busy star is clicked", () => {
    act(() => stars()[0].click());
    expect(onOpenDocument).not.toHaveBeenCalled();
  });
});
