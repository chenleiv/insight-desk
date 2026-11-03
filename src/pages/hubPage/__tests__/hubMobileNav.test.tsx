import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusContext, type StatusApi } from "../../../components/statusBar/statusContext";
import { ConfirmContext, type ConfirmFn } from "../../../components/confirmModal/confirmContext";
import type { DocumentItem } from "../../../api/documentsClient";
import HubPage from "../HubPage";
import { resetGuides } from "../utils/guides";

// Stable values, as the real query hook returns: a new array per render would never settle.
const { auth, screen, keyboard, documents, setDocs, deleteDocument } = vi.hoisted(() => ({
  auth: {
    user: { email: "admin@example.com", role: "admin" } as { email: string; role: string },
    logout: vi.fn(async () => {}),
    toggleFavorite: () => {},
    favoritesMap: {},
    updateUser: () => {},
  },
  screen: { isMobile: true },
  keyboard: { open: false },
  documents: {
    docs: [
      { id: "d1", title: "Notes", category: "", content: "" },
      { id: "d2", title: "Handbook", category: "", content: "" },
    ],
    loading: false,
    error: null,
  },
  setDocs: vi.fn(),
  deleteDocument: vi.fn(async () => {}),
}));

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => auth }));
vi.mock("../../../context/DocumentsContext", () => ({
  DOCUMENTS_QUERY_KEY: ["documents"],
  useDocuments: () => documents,
  useSetDocs: () => setDocs,
}));
vi.mock("../../../hooks/useMobile", () => ({ useMobile: () => screen.isMobile }));
vi.mock("../../../hooks/useKeyboardOpen", () => ({ useKeyboardOpen: () => keyboard.open }));
vi.mock("../../../api/documentsClient", async (original) => ({
  ...(await original<typeof import("../../../api/documentsClient")>()),
  deleteDocument,
}));
vi.mock("../components/views/DashboardView", () => ({
  default: ({ onNewDocument }: { onNewDocument: () => void }) => (
    <button type="button" className="fake-dashboard" onClick={onNewDocument}>New</button>
  ),
}));
vi.mock("../components/views/QualityView", () => ({ default: () => <div className="fake-quality" /> }));

// A draft in local state, to show whether the chat stayed mounted.
vi.mock("../components/views/AIAssistantView", () => ({
  default: function FakeChat() {
    const [draft, setDraft] = useState("");
    return <button type="button" className="fake-chat" onClick={() => setDraft("typed")}>{draft}</button>;
  },
}));

vi.mock("../components/documents/DocumentPane", () => ({
  default: (props: {
    doc: DocumentItem | null;
    isCreating: boolean;
    onDirtyChange: (dirty: boolean) => void;
    onCancelCreate: () => void;
    onCreated: (doc: DocumentItem) => void;
    onClose: () => void;
    onDelete: (doc: DocumentItem) => void;
  }) => (
    <div className="fake-pane" data-creating={props.isCreating}>
      <button type="button" className="pane-dirty" onClick={() => props.onDirtyChange(true)} />
      <button type="button" className="pane-cancel" onClick={props.onCancelCreate} />
      <button type="button" className="pane-created" onClick={() => props.onCreated({ id: "d2", title: "Handbook" } as DocumentItem)} />
      <button type="button" className="pane-close" onClick={props.onClose} />
      <button type="button" className="pane-delete" onClick={() => props.onDelete(props.doc!)} />
    </div>
  ),
}));

const status: StatusApi = { show: vi.fn(), clear: vi.fn() };
const confirm = vi.fn<ConfirmFn>();

// Node's own localStorage global hides jsdom's here, so tests get a small in-memory one.
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

let container: HTMLDivElement;
let root: Root;
let router: ReturnType<typeof createMemoryRouter>;

function renderHub(...entries: string[]) {
  router = createMemoryRouter([{ path: "*", element: <HubPage /> }], {
    initialEntries: entries.length ? entries : ["/hub"],
    initialIndex: Math.max(entries.length - 1, 0),
  });
  act(() => root.render(
    <QueryClientProvider client={new QueryClient()}>
      <StatusContext.Provider value={status}>
        <ConfirmContext.Provider value={confirm}>
          <RouterProvider router={router} />
        </ConfirmContext.Provider>
      </StatusContext.Provider>
    </QueryClientProvider>
  ));
}

const q = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const search = () => router.state.location.search;
const activeTab = () => q("[aria-current='page']")?.textContent;
const documentsList = () => q(".hub-documents")!;
const listShown = () => !documentsList().classList.contains("hub-keepalive--hidden");
const chat = () => q(".fake-chat");
const chatShown = () => !chat()?.closest(".hub-keepalive")?.classList.contains("hub-keepalive--hidden");

async function tap(selector: string) {
  await act(async () => { q(selector)!.click(); });
}

async function back() {
  await act(async () => { await router.navigate(-1); });
}

function typeFilter(value: string) {
  const input = q<HTMLInputElement>(".hub-documents .doc-panel-search-input")!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const rows = () => [...document.querySelectorAll(".hub-documents .doc-panel-row-title")].map((el) => el.textContent);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", memoryStorage());
  localStorage.setItem("insight-desk:welcomed", "1");
  auth.user = { email: "admin@example.com", role: "admin" };
  auth.logout.mockClear();
  deleteDocument.mockClear();
  screen.isMobile = true;
  keyboard.open = false;
  confirm.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("hub navigation on phones", () => {
  it("has the bottom nav and no menu, documents or Ask Brainy buttons in the top bar", () => {
    renderHub();
    expect(q(".bottom-nav")).not.toBeNull();
    expect(activeTab()).toBe("Brainy");
    expect(q("[aria-label='Menu']")).toBeNull();
    expect(q("[aria-label='Open documents']")).toBeNull();
    expect(q("[aria-label='Ask Brainy']")).toBeNull();
  });

  it("hides the bottom nav while the keyboard is open", () => {
    keyboard.open = true;
    renderHub();
    expect(q(".bottom-nav")).toBeNull();
  });

  it("gives every tab a history entry that Back returns through", async () => {
    renderHub();
    await tap(".bottom-nav-item--dashboard");
    expect(search()).toBe("?view=dashboard");
    await tap(".bottom-nav-item--settings");
    expect(activeTab()).toBe("Settings");
    await back();
    expect(activeTab()).toBe("Dashboard");
    await back();
    expect(activeTab()).toBe("Brainy");
  });

  it("does nothing when the active tab is tapped", async () => {
    renderHub("/hub?view=dashboard");
    const key = router.state.location.key;
    await tap(".bottom-nav-item--dashboard");
    expect(router.state.location.key).toBe(key);
    expect(search()).toBe("?view=dashboard");
  });

  it("shows the list as its own screen, with no bottom sheet", async () => {
    renderHub();
    expect(listShown()).toBe(false);
    await tap(".bottom-nav-item--documents");
    expect(search()).toBe("?view=documents");
    expect(listShown()).toBe(true);
    expect(rows()).toEqual(["Notes", "Handbook"]);
    expect(q(".mobile-doc-picker-sheet")).toBeNull();
  });

  it("returns from a document to the list with its filter intact", async () => {
    renderHub("/hub?view=documents");
    typeFilter("note");
    expect(rows()).toEqual(["Notes"]);

    await tap(".hub-documents .doc-panel-row");
    expect(search()).toBe("?doc=d1");
    expect(listShown()).toBe(false);
    expect(activeTab()).toBe("Documents");

    await back();
    expect(search()).toBe("?view=documents");
    expect(listShown()).toBe(true);
    expect(rows()).toEqual(["Notes"]);
  });

  it("goes from an open document to the list when the Documents tab is tapped", async () => {
    renderHub("/hub?doc=d1");
    await tap(".bottom-nav-item--documents");
    expect(search()).toBe("?view=documents");
  });

  it("closes a document to the list", async () => {
    renderHub("/hub?doc=d1");
    await tap(".pane-close");
    expect(search()).toBe("?view=documents");
  });

  it("replaces a deleted document with the list, so Back cannot return to it", async () => {
    confirm.mockResolvedValue(true);
    renderHub("/hub?view=dashboard", "/hub?doc=d1");
    await tap(".pane-delete");
    expect(deleteDocument).toHaveBeenCalledWith("d1");
    expect(search()).toBe("?view=documents");
    await back();
    expect(search()).toBe("?view=dashboard");
  });

  it("has no floating Ask Brainy button, since the tab replaces it", () => {
    renderHub("/hub?doc=d1");
    expect(q(".brainy-fab")).toBeNull();
  });

  it("keeps the chat and its draft while other tabs are open", async () => {
    renderHub();
    await tap(".fake-chat");
    await tap(".bottom-nav-item--settings");
    expect(chatShown()).toBe(false);
    await tap(".bottom-nav-item--ai");
    expect(chatShown()).toBe(true);
    expect(chat()!.textContent).toBe("typed");
  });

  it("does not load the chat until it is first opened", async () => {
    renderHub("/hub?doc=d1");
    expect(chat()).toBeNull();
    await tap(".bottom-nav-item--ai");
    expect(chat()).not.toBeNull();
  });

  it("points the tour at the bottom nav", async () => {
    localStorage.removeItem("insight-desk:welcomed");
    renderHub();
    await tap(".welcome-cta");
    expect(q(".tour-callout-title")!.textContent).toContain("Document list");
    expect(q(".tour-spotlight")).not.toBeNull();
  });
});

describe("guides on phones", () => {
  const stored = () => [
    localStorage.getItem("insight-desk:welcomed"),
    localStorage.getItem("insight-desk:doc-toured"),
    localStorage.getItem("insight-desk:new-doc-toured"),
  ];

  function renderFirstVisit() {
    localStorage.removeItem("insight-desk:welcomed");
    renderHub();
  }

  async function tapText(text: string) {
    const target = [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === text);
    await act(async () => { target!.click(); });
  }

  it("keeps the welcome and every guide after a tap outside it", async () => {
    renderFirstVisit();
    await tap(".welcome-overlay");
    expect(q(".welcome-modal")).not.toBeNull();
    expect(stored()).toEqual([null, null, null]);
  });

  it.each([".welcome-skip", ".welcome-close"])("skips every guide from the welcome's explicit %s", async (selector) => {
    renderFirstVisit();
    await tap(selector);
    expect(q(".welcome-modal")).toBeNull();
    expect(stored()).toEqual(["1", "1", "1"]);
  });

  it("keeps the tour and the other guides after a tap outside the bubble", async () => {
    renderFirstVisit();
    await tap(".welcome-cta");
    await tap(".tour-backdrop");
    expect(q(".tour-callout")).not.toBeNull();
    expect(stored()).toEqual(["1", null, null]);
  });

  it("skips every guide from the Skip button", async () => {
    renderFirstVisit();
    await tap(".welcome-cta");
    await tap(".tour-skip");
    expect(q(".tour-callout")).toBeNull();
    expect(stored()).toEqual(["1", "1", "1"]);
  });

  it("spotlights a real bottom nav element on every step, and finishing leaves the other guides", async () => {
    renderFirstVisit();
    await tap(".welcome-cta");
    for (const title of ["Document list", "Brainy AI", "Navigation"]) {
      expect(q(".tour-callout-title")!.textContent).toContain(title);
      expect(q(".tour-spotlight")).not.toBeNull();
      await tap(".tour-btn--primary");
    }
    expect(q(".tour-callout")).toBeNull();
    expect(q(".bottom-nav")).not.toBeNull();
    expect(stored()).toEqual(["1", null, null]);
  });

  it("starts over from Show the guides again in the settings", async () => {
    renderHub();
    await tap(".bottom-nav-item--settings");
    await tapText("Show the guides again");
    expect(q(".welcome-modal")).not.toBeNull();
    await tap(".welcome-cta");
    expect(q(".tour-callout-title")!.textContent).toContain("Document list");
    expect(q(".bottom-nav")).not.toBeNull();
  });

  it("still asks about unsaved changes when Back is used during a tour, and leaves the draft on no", async () => {
    renderHub("/hub", "/hub?view=new");
    await tap(".pane-dirty");
    act(() => resetGuides());
    await tap(".welcome-cta");
    confirm.mockResolvedValue(false);

    await back();

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(search()).toBe("?view=new");
    expect(q(".tour-callout")).not.toBeNull();
  });

  it("still asks about unsaved changes on a tab after the tour ends", async () => {
    renderHub("/hub?view=new");
    await tap(".pane-dirty");
    act(() => resetGuides());
    await tap(".welcome-cta");
    await tap(".tour-skip");
    confirm.mockResolvedValue(false);

    await tap(".bottom-nav-item--settings");

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(search()).toBe("?view=new");
  });
});

describe("new document form on phones", () => {
  it("has its own URL, so Back returns to the list", async () => {
    renderHub("/hub?view=documents");
    await tap(".hub-documents .doc-panel-new-row");
    expect(search()).toBe("?view=new");
    expect(q(".fake-pane")!.dataset.creating).toBe("true");
    expect(activeTab()).toBe("Documents");
    await back();
    expect(search()).toBe("?view=documents");
    expect(q(".fake-pane")).toBeNull();
  });

  it("asks before Back discards a draft, and stays when the answer is no", async () => {
    confirm.mockResolvedValue(false);
    renderHub("/hub?view=documents", "/hub?view=new");
    await tap(".pane-dirty");
    await back();
    expect(confirm).toHaveBeenCalledOnce();
    expect(search()).toBe("?view=new");
  });

  it("leaves on Back when the draft may be discarded", async () => {
    confirm.mockResolvedValue(true);
    renderHub("/hub?view=documents", "/hub?view=new");
    await tap(".pane-dirty");
    await back();
    expect(search()).toBe("?view=documents");
  });

  it("asks before a tab discards a draft", async () => {
    confirm.mockResolvedValue(false);
    renderHub("/hub?view=documents", "/hub?view=new");
    await tap(".pane-dirty");
    await tap(".bottom-nav-item--settings");
    expect(confirm).toHaveBeenCalledOnce();
    expect(search()).toBe("?view=new");
  });

  it("cancels back to where it was opened from", async () => {
    renderHub("/hub?view=dashboard");
    await tap(".fake-dashboard");
    expect(search()).toBe("?view=new");
    await tap(".pane-cancel");
    expect(search()).toBe("?view=dashboard");
  });

  it("cancels to the list when it was opened by a direct link", async () => {
    renderHub("/hub?view=new");
    await tap(".pane-cancel");
    expect(search()).toBe("?view=documents");
  });

  it("replaces the form with the new document, so Back skips the empty form", async () => {
    renderHub("/hub?view=documents", "/hub?view=new");
    await tap(".pane-created");
    expect(search()).toBe("?doc=d2");
    await back();
    expect(search()).toBe("?view=documents");
  });

  it("sends a viewer to the list, who may not create documents", () => {
    auth.user = { email: "viewer@example.com", role: "viewer" };
    renderHub("/hub?view=new");
    expect(q(".fake-pane")).toBeNull();
    expect(listShown()).toBe(true);
  });
});

describe("Back from a document on phones", () => {
  it("returns to the list through history, so the next Back does not reopen the document", async () => {
    renderHub("/hub?view=dashboard", "/hub?view=documents", "/hub?doc=d1");
    await tap(".pane-close");
    expect(search()).toBe("?view=documents");
    expect(router.state.historyAction).toBe("POP");
    await back();
    expect(search()).toBe("?view=dashboard");
  });

  it("returns to the screen the document was opened from", async () => {
    renderHub("/hub?view=dashboard", "/hub?doc=d1");
    await tap(".pane-close");
    expect(search()).toBe("?view=dashboard");
  });

  it("replaces a direct link with the list", async () => {
    renderHub("/hub?doc=d1");
    await tap(".pane-close");
    expect(search()).toBe("?view=documents");
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("stays on the document when the unsaved changes are kept", async () => {
    confirm.mockResolvedValue(false);
    renderHub("/hub?view=documents", "/hub?doc=d1");
    await tap(".pane-dirty");
    await tap(".pane-close");
    expect(confirm).toHaveBeenCalledOnce();
    expect(search()).toBe("?doc=d1");
  });

  it("asks once and leaves when the unsaved changes are discarded", async () => {
    confirm.mockResolvedValue(true);
    renderHub("/hub?view=documents", "/hub?doc=d1");
    await tap(".pane-dirty");
    await tap(".pane-close");
    expect(confirm).toHaveBeenCalledOnce();
    expect(search()).toBe("?view=documents");
  });

  it("leaves the new-document form through history too", async () => {
    renderHub("/hub?view=documents", "/hub?view=new");
    await tap(".pane-close");
    expect(search()).toBe("?view=documents");
    expect(router.state.historyAction).toBe("POP");
  });
});

describe("direct links on phones", () => {
  it("opens a document, under the Documents tab", () => {
    renderHub("/hub?doc=d1");
    expect(q(".fake-pane")).not.toBeNull();
    expect(activeTab()).toBe("Documents");
  });

  it("falls back to the chat for a document that does not exist", async () => {
    await act(async () => renderHub("/hub?doc=gone"));
    expect(search()).toBe("");
    expect(activeTab()).toBe("Brainy");
  });
});

describe("roles on phones", () => {
  it.each([["admin", true], ["demo", true], ["viewer", false]])("%s sees Quality: %s", (role, shown) => {
    auth.user = { email: "user@example.com", role };
    renderHub();
    expect(q(".bottom-nav-item--quality") !== null).toBe(shown);
  });

  it("sends a viewer away from the quality URL", () => {
    auth.user = { email: "viewer@example.com", role: "viewer" };
    renderHub("/hub?view=quality");
    expect(q(".fake-quality")).toBeNull();
    expect(activeTab()).toBe("Brainy");
  });

  it("gives the demo the one-line banner", () => {
    auth.user = { email: "demo-1@demo.invalid", role: "demo" };
    renderHub();
    expect(q(".demo-banner-toggle")!.textContent).toBe("Demo workspace · Details");
  });
});

describe("signing out on phones", () => {
  it("is in the account tab of the settings", async () => {
    renderHub("/hub?view=settings");
    await tap(".settings-signout-btn");
    expect(auth.logout).toHaveBeenCalledOnce();
  });
});

describe("hub navigation on wider screens", () => {
  beforeEach(() => { screen.isMobile = false; });

  it("has no bottom nav and keeps the top navigation and side panel", () => {
    renderHub();
    expect(q(".bottom-nav")).toBeNull();
    expect(q(".hub-layout--bottom-nav")).toBeNull();
    expect(q(".hub-documents")).toBeNull();
    expect(q(".topbar-nav")).not.toBeNull();
    expect(q(".doc-panel-wrapper")).not.toBeNull();
  });

  it("shows the chat for the documents URL, and leaves the URL alone for a rotation back", () => {
    renderHub("/hub?view=documents");
    expect(chat()).not.toBeNull();
    expect(search()).toBe("?view=documents");
  });

  it("keeps the new-document form open at the URL it has on a phone", () => {
    renderHub("/hub?view=new");
    expect(q(".fake-pane")!.dataset.creating).toBe("true");
  });

  it("creates a document without changing the URL, closes to the chat and keeps the floating button", async () => {
    renderHub();
    await tap(".doc-panel-new-row");
    expect(search()).toBe("");
    expect(q(".fake-pane")!.dataset.creating).toBe("true");
    await tap(".pane-cancel");
    expect(q(".fake-pane")).toBeNull();
    expect(chat()).not.toBeNull();

    await tap(".doc-panel-row");
    expect(search()).toBe("?doc=d1");
    expect(q(".brainy-fab")).not.toBeNull();
    await tap(".pane-close");
    expect(search()).toBe("");
  });

  it("keeps signing out in the user menu, not the settings", async () => {
    renderHub("/hub?view=settings");
    expect(q(".settings-signout-btn")).toBeNull();
    expect(q(".topbar-user-btn")).not.toBeNull();
  });

  it("still closes a document to the chat with a new history entry", async () => {
    renderHub("/hub?view=dashboard", "/hub?doc=d1");
    await tap(".pane-close");
    expect(search()).toBe("");
    expect(router.state.historyAction).toBe("PUSH");
  });

  it("gives the demo the longer one-line banner, collapsed", () => {
    auth.user = { email: "demo-1@demo.invalid", role: "demo" };
    renderHub();
    expect(q(".demo-banner-toggle")!.textContent).toBe("Demo workspace · Your changes reset when you sign out · Details");
    expect(q(".demo-banner-toggle")!.getAttribute("aria-expanded")).toBe("false");
    expect(q<HTMLElement>(".demo-banner-details")!.hidden).toBe(true);
  });
});
