import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import DashboardView from "../DashboardView";

const { auth, documents } = vi.hoisted(() => ({
  auth: {
    user: { email: "visitor@example.com", role: "admin" },
    favoritesMap: { "doc-2": true } as Record<string, boolean>,
    toggleFavorite: vi.fn(async () => {}),
  },
  documents: {
    docs: [
      { id: "doc-1", title: "Notes", category: "Work", content: "", updatedAt: "2026-01-02T00:00:00Z" },
      { id: "doc-2", title: "Handbook", category: "", content: "", updatedAt: "2026-01-01T00:00:00Z" },
    ],
    loading: false,
    error: null,
  },
}));

vi.mock("../../../../../auth/useAuth", () => ({ useAuth: () => auth }));
vi.mock("../../../../../context/DocumentsContext", () => ({ useDocuments: () => documents }));

let container: HTMLDivElement;
let root: Root;
const onOpenDocument = vi.fn();

const stars = () => [...container.querySelectorAll<HTMLButtonElement>("button.recent-doc-star")];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  auth.toggleFavorite.mockClear();
  onOpenDocument.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<DashboardView onOpenDocument={onOpenDocument} />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("recent documents favorite star", () => {
  it("is a real button with a name and state, outside the row's open button", () => {
    expect(stars().map((b) => b.getAttribute("aria-label"))).toEqual(["Add to favorites", "Remove from favorites"]);
    expect(stars().map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
    expect(container.querySelector("button button")).toBeNull();
  });

  it("toggles the favorite without opening the document", () => {
    act(() => stars()[0].click());
    expect(auth.toggleFavorite).toHaveBeenCalledWith("doc-1");
    expect(onOpenDocument).not.toHaveBeenCalled();
  });

  it("leaves opening the document to the row", () => {
    act(() => container.querySelector<HTMLElement>(".recent-doc-open")!.click());
    expect(onOpenDocument).toHaveBeenCalledWith("doc-1");
    expect(auth.toggleFavorite).not.toHaveBeenCalled();
  });
});
