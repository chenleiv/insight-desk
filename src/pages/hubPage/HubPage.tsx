import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import { X, PanelLeftOpen, PanelLeftClose, Bot } from "lucide-react";

import HubSidebar from "./components/HubSidebar";
import HubDocumentList from "./components/HubDocumentList";
import HubPane from "./components/HubPane";
import HubAssistant from "./components/HubAssistant";
import DocumentPane from "./components/DocumentPane";

import { useDocuments } from "../../context/DocumentsContext";
import { useAuth } from "../../auth/useAuth";
import { useStatus } from "../../components/statusBar/useStatus";
import useConfirm from "../../hooks/useConfirm";
import { useMobile } from "../../hooks/useMobile";
import { useResize } from "../../hooks/useResize";
import { useOnboarding } from "../../hooks/useOnboarding";
import { ResizeHandle } from "../../components/resizeHandle/ResizeHandle";
import { Popover } from "../../components/popover/Popover";

import { normalizeOrder, sameArray, applyOrder } from "./utils/ordering";
import { saveJson, loadJson, scopedKey } from "../../utils/storage";
import { normalizeImportedDocuments } from "./utils/hubHelpers";
import {
  deleteDocument,
  importDocumentsBulk,
  type DocumentItem,
} from "../../api/documentsClient";
import { downloadExport } from "../../api/downloadExport";
import { matchesQuery } from "./utils/docs";
import { CONTEXT_KEY } from "./utils/assistantUtils";

import "./hubPage.scss";

export default function HubPage() {
  const {
    user,
    toggleFavorite: globalToggleFavorite,
    favoritesMap: favorites,
  } = useAuth();
  const status = useStatus();
  const isMobile = useMobile();
  const confirm = useConfirm();
  const {
    hasClickedFab,
    hasSelectedContext,
    hasSeenDemo,
    completeFab,
    completeCtx,
    completeDemo,
  } = useOnboarding();

  const [demoStep, setDemoStep] = useState(-1);

  useEffect(() => {
    if (!hasSeenDemo) {
      setDemoStep(0);
      if (isMobile) {
        setIsAssistantOpen(false);
      }
    }
  }, [hasSeenDemo, isMobile]);

  const nextDemoStep = () => {
    const maxSteps = isMobile ? 2 : 4;
    if (demoStep < maxSteps) {
      setDemoStep((prev) => prev + 1);
    } else {
      setDemoStep(-1);
      completeDemo();
    }
  };

  const skipDemo = () => {
    setDemoStep(-1);
    completeDemo();
  };

  const renderDemoAction = (isLast: boolean) => (
    <div
      style={{
        display: "flex",
        gap: "12px",
        justifyContent: "flex-end",
        alignItems: "center",
      }}
    >
      {!isLast && (
        <button
          className="text-btn"
          style={{
            fontSize: "12px",
            opacity: 0.8,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "inherit",
            padding: 0,
          }}
          onClick={skipDemo}
        >
          Skip Tour
        </button>
      )}
      <button
        className="text-btn"
        style={{
          fontSize: "13px",
          fontWeight: 600,
          padding: "6px 16px",
          borderRadius: "20px",
          background: "var(--bg)",
          color: "var(--text)",
          border: "none",
          cursor: "pointer",
        }}
        onClick={nextDemoStep}
      >
        {isLast ? "Start exploring!" : "Next"}
      </button>
    </div>
  );

  const isAdmin = user?.role === "admin";
  const orderKey = scopedKey("documentsOrder", user?.email);

  const {
    docs,
    setDocs,
    loadDocuments,
    loading: docsLoading,
    error: docsError,
  } = useDocuments();

  // Unified State
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<number[]>([]);
  const [activeDocId, setActiveDocId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>(() =>
    loadJson<number[]>(CONTEXT_KEY, []),
  );

  const [isAssistantOpen, setIsAssistantOpen] = useState(true);
  const [isAssistantMaximized, setIsAssistantMaximized] = useState(false);
  const [isAssistantMinimized, setIsAssistantMinimized] = useState(false);
  const [isDocumentMaximized, setIsDocumentMaximized] = useState(false);
  const [isDocumentMinimized, setIsDocumentMinimized] = useState(false);

  const [isCreating, setIsCreating] = useState(false);
  const [isPaneDirty, setIsPaneDirty] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [showForbidden, setShowForbidden] = useState(false);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { width: sidebarWidth, startResize: startSidebarResize } = useResize(
    320, // initial
    240, // min
    480, // max
  );

  const lastActiveDocIdRef = useRef<number | null>(null);

  const activeDoc = useMemo(() => {
    if (activeDocId == null) return null;
    return docs.find((d) => d.id === activeDocId) ?? null;
  }, [activeDocId, docs]);

  // Initial Load
  const load = useCallback(async () => {
    setError(null);
    await loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    if (docs.length === 0) void load();
  }, [load, docs.length]);

  useEffect(() => {
    if (docs.length > 0) {
      setOrder((prev) => {
        const next = normalizeOrder(prev, docs);
        if (!sameArray(next, prev)) saveJson(orderKey, next);
        return next;
      });

      setActiveDocId((prev) => {
        if (prev != null)
          return docs.some((d) => d.id === prev) ? prev : (docs[0]?.id ?? null);
        return docs.length > 0 ? docs[0].id : null;
      });
    }
  }, [docs, orderKey]);

  useEffect(() => {
    if (docsError) setError(docsError);
  }, [docsError]);

  // Sync AI Selection
  useEffect(() => {
    if (docs.length > 0) {
      const ids = new Set(docs.map((d) => d.id));
      setSelectedIds((prev) => {
        const next = prev.filter((id) => ids.has(id));
        if (!sameArray(next, prev)) saveJson(CONTEXT_KEY, next);
        return next;
      });
    }
  }, [docs]);

  // Handlers
  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      saveJson(CONTEXT_KEY, next);
      return next;
    });
    if (!hasSelectedContext) completeCtx();
    // Only auto-open the assistant pane on desktop
    if (!isMobile && !isAssistantOpen) setIsAssistantOpen(true);
  }

  async function openDocument(id: number) {
    if (id === activeDocId && !isCreating) {
      if (isMobile) setIsAssistantOpen(false);
      setMobileView("detail");
      return;
    }

    if (isPaneDirty) {
      const ok = await confirm({
        title: "Unsaved Changes",
        message: "You have unsaved changes. Discard them?",
        confirmLabel: "Discard",
        variant: "danger",
      });
      if (!ok) return;
    }

    setIsCreating(false);
    setActiveDocId(id);
    setIsAssistantMaximized(false);
    setIsDocumentMaximized(false);
    setIsDocumentMinimized(false);
    if (isMobile) setIsAssistantOpen(false);
    setMobileView("detail");
  }

  function handleCreated(doc: DocumentItem) {
    setIsCreating(false);
    setDocs((prev) => [doc, ...prev]);
    setOrder((prev) => {
      const next = [doc.id, ...prev.filter((x) => x !== doc.id)];
      saveJson(orderKey, next);
      return next;
    });
    setActiveDocId(doc.id);
    setIsAssistantMaximized(false);
    setIsDocumentMaximized(false);
    setIsDocumentMinimized(false);
    if (isMobile) setIsAssistantOpen(false);
    setMobileView("detail");
  }

  async function openCreate() {
    if (isPaneDirty) {
      const ok = await confirm({
        title: "Unsaved Changes",
        message: "Discard unsaved changes?",
        confirmLabel: "Discard",
        variant: "danger",
      });
      if (!ok) return;
    }
    setQuery("");
    lastActiveDocIdRef.current = activeDocId;
    setIsCreating(true);
    setActiveDocId(null);
    setIsAssistantMaximized(false);
    setIsDocumentMinimized(false);
    if (isMobile) setIsAssistantOpen(false);
    setMobileView("detail");
  }

  const orderedDocs = useMemo(() => applyOrder(docs, order), [docs, order]);
  const filteredDocs = useMemo(() => {
    let result = orderedDocs;
    if (showOnlyFavorites) result = result.filter((d) => favorites[d.id]);
    return result.filter((d) => matchesQuery(d, query));
  }, [orderedDocs, showOnlyFavorites, favorites, query]);

  // Logic from DocumentsPage (Import/Export/Delete)
  async function onDelete(doc: DocumentItem) {
    const ok = await confirm({
      title: "Delete document",
      message: `Delete "${doc.title}"?`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteDocument(doc.id);
      const wasActive = activeDocId === doc.id;
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      setOrder((prev) => {
        const next = prev.filter((x) => x !== doc.id);
        saveJson(orderKey, next);
        return next;
      });
      if (wasActive) {
        setActiveDocId(orderedDocs.find((d) => d.id !== doc.id)?.id ?? null);
        setMobileView("list");
      }
      status.show({ kind: "success", message: "Document deleted." });
    } catch (e) {
      status.show({
        kind: "error",
        title: "Delete failed",
        message: e instanceof Error ? e.message : "Error",
      });
    }
  }

  async function requestImport(mode: "merge" | "replace") {
    if (!isAdmin) {
      status.show({
        kind: "error",
        title: "Forbidden",
        message: "Admins only.",
      });
      return;
    }
    if (mode === "replace") {
      const ok = await confirm({
        title: "Replace all?",
        message: "This will delete everything. Proceed?",
        confirmLabel: "Replace",
        variant: "danger",
      });
      if (!ok) return;
    }
    onImport(mode);
  }

  async function onImport(mode: "merge" | "replace") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      try {
        const file = input.files?.[0];
        if (!file) return;
        const text = await file.text();
        const documents = normalizeImportedDocuments(JSON.parse(text));
        if (documents.length === 0) return;
        await importDocumentsBulk({ mode, documents });
        await load();
        status.show({ kind: "success", message: "Import completed." });
      } catch (_e) {
        status.show({
          kind: "error",
          title: "Import failed",
          message: "Error",
        });
      }
    };
    input.click();
  }

  async function onExport() {
    try {
      await downloadExport();
      status.show({ kind: "success", message: "Export started." });
    } catch (_e) {
      status.show({ kind: "error", title: "Export failed", message: "Error" });
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const oldIdx = prev.indexOf(active.id as number);
      const newIdx = prev.indexOf(over.id as number);
      if (oldIdx === -1 || newIdx === -1) return prev;
      const next = arrayMove(prev, oldIdx, newIdx);
      saveJson(orderKey, next);
      return next;
    });
  }

  return (
    <div
      className={`hub-layout ${isMobile && mobileView === "detail" ? "mobile-view-detail" : "mobile-view-list"} ${!sidebarOpen ? "sidebar-closed" : ""}`}
    >
      <aside
        className="hub-sidebar demo-nav-target"
        style={
          !isMobile && sidebarOpen
            ? { width: sidebarWidth, minWidth: sidebarWidth }
            : undefined
        }
        onClick={() => {
          if (!sidebarOpen && !isMobile) {
            setSidebarOpen(true);
            // Optionally, un-maximize others when explicitly opening sidebar via click
            setIsDocumentMaximized(false);
            setIsAssistantMaximized(false);
          }
        }}
        data-tooltip={!sidebarOpen && !isMobile ? "Expand Sidebar" : undefined}
        data-tooltip-pos="right"
      >
        <HubSidebar
          isAdmin={isAdmin}
          query={query}
          onQueryChange={setQuery}
          error={error}
          showForbidden={showForbidden}
          onCloseForbidden={() => setShowForbidden(false)}
          onNew={openCreate}
          onExport={onExport}
          onImport={requestImport}
          showOnlyFavorites={showOnlyFavorites}
          onToggleFavorites={() => setShowOnlyFavorites(!showOnlyFavorites)}
          sidebarToggle={
            !isMobile ? (
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                data-tooltip={sidebarOpen ? "Close sidebar" : "Open sidebar"}
                data-tooltip-pos="bottom"
              >
                {sidebarOpen ? (
                  <PanelLeftClose size={18} />
                ) : (
                  <PanelLeftOpen size={18} />
                )}
              </button>
            ) : null
          }
          onExpand={() => {
            if (!sidebarOpen) setSidebarOpen(true);
          }}
        >
          <HubDocumentList
            docs={filteredDocs}
            activeDocId={activeDocId}
            selectedIds={selectedIds}
            favorites={favorites}
            isAdmin={isAdmin}
            openMenuId={openMenuId}
            onToggleMenu={setOpenMenuId}
            onCloseMenu={() => setOpenMenuId(null)}
            onOpen={openDocument}
            onToggleFavorite={globalToggleFavorite}
            onToggleSelected={toggleSelected}
            onDelete={onDelete}
            onDragEnd={onDragEnd}
            loading={docsLoading}
          />
        </HubSidebar>
      </aside>

      {!isMobile && sidebarOpen && (
        <ResizeHandle onMouseDown={startSidebarResize} />
      )}

      <main className="hub-main">
        <HubPane
          isMobile={isMobile}
          isAssistantOpen={isAssistantOpen}
          onToggleAssistant={() => {
            if (isAssistantOpen) {
              setIsAssistantMaximized(false);
            }
            setIsAssistantOpen(!isAssistantOpen);
          }}
          isAssistantMaximized={isAssistantMaximized}
          isAssistantMinimized={isAssistantMinimized}
          isDocumentMaximized={isDocumentMaximized}
          isDocumentMinimized={isDocumentMinimized}
          editorNode={
            <DocumentPane
              key={isCreating ? "creating" : (activeDoc?.id ?? "empty")}
              doc={activeDoc}
              canEdit={isAdmin}
              isCreating={isCreating}
              onCancelCreate={() => {
                setIsCreating(false);
                setActiveDocId(lastActiveDocIdRef.current);
              }}
              onCreated={handleCreated}
              hasDocs={docs.length > 0}
              loading={docsLoading}
              onSaved={(updated) =>
                setDocs((p) =>
                  p.map((d) => (d.id === updated.id ? updated : d)),
                )
              }
              onDirtyChange={setIsPaneDirty}
              isMaximized={isDocumentMaximized}
              onToggleMaximize={() => {
                const nextMax = !isDocumentMaximized;
                setIsDocumentMaximized(nextMax);
                if (nextMax) {
                  setIsAssistantMaximized(false);
                  setIsAssistantMinimized(true);
                  setIsDocumentMinimized(false);
                  setSidebarOpen(false);
                } else {
                  setSidebarOpen(true);
                  setIsAssistantMinimized(false);
                }
              }}
              onMinimize={() => {
                if (isMobile) {
                  setMobileView("list");
                  return;
                }
                setIsDocumentMinimized(true);
                setIsDocumentMaximized(false);
                setIsAssistantMaximized(true);
                setIsAssistantMinimized(false);
              }}
              isMinimized={isDocumentMinimized || isAssistantMaximized}
              onExpand={() => {
                setIsDocumentMinimized(false);
                setIsAssistantMaximized(false);
                setIsDocumentMaximized(false);
              }}
            />
          }
          assistantNode={
            <HubAssistant
              isMobile={isMobile}
              selectedIds={selectedIds}
              isMaximized={isAssistantMaximized}
              isMinimized={isAssistantMinimized || isDocumentMaximized}
              onToggleMaximize={() => {
                const nextMax = !isAssistantMaximized;
                setIsAssistantMaximized(nextMax);
                if (nextMax) {
                  setSidebarOpen(false);
                  setIsDocumentMaximized(false);
                  setIsDocumentMinimized(true);
                  setIsAssistantMinimized(false);
                } else {
                  setIsDocumentMinimized(false);
                }
              }}
              onMinimize={() => {
                if (isMobile) {
                  setIsAssistantOpen(false);
                  return;
                }
                setIsAssistantMaximized(false);
                setIsAssistantMinimized(true);
                setIsDocumentMaximized(false);
                setIsDocumentMinimized(false);
              }}
              onExpand={() => {
                setIsAssistantMinimized(false);
                setIsAssistantMaximized(false);
                setIsDocumentMaximized(false);
              }}
              onSelectDocuments={() => {
                if (isMobile) {
                  setMobileView("list");
                  setIsAssistantOpen(false);
                }
              }}
              onToggleSelected={toggleSelected}
              onClearSelection={() => {
                setSelectedIds([]);
                saveJson(CONTEXT_KEY, []);
              }}
            />
          }
        />
      </main>

      {/* Global AI Assistant Floating Action Button */}
      {!isAssistantOpen && isMobile && (
        <>
          <button
            onClick={() => {
              setIsAssistantOpen(true);
              if (isMobile) setMobileView("detail"); // Switch view context so sheet can open
              if (!hasClickedFab) completeFab();
            }}
            className="global-fab-assistant"
            aria-label="Open AI Assistant"
            data-tooltip="Open AI Assistant"
            data-tooltip-pos="left"
          >
            <Bot size={26} />
          </button>

          <Popover
            isOpen={!hasClickedFab && demoStep === -1}
            onClose={completeFab}
            title="Chat with your Docs"
            body="New! Click the AI Assistant to ask questions and extract knowledge from your workspace."
            position="top"
            targetSelector=".global-fab-assistant"
          />
        </>
      )}

      {isMobile && mobileView === "detail" && (
        <button
          onClick={() => setMobileView("list")}
          className="mobile-context-close-btn"
          aria-label="Back to list"
        >
          <X />
        </button>
      )}

      {/* Guided First-Time Demo */}
      <Popover
        isOpen={demoStep === 0 && !isMobile}
        onClose={skipDemo}
        title="Welcome to your Workspace!"
        body="The Editor lives in the center, flanked by your Tools. You can write, generate, and explore all in one view."
        position="bottom"
        targetSelector=".demo-welcome-target"
        offset={20}
        actionButton={renderDemoAction(false)}
      />

      <Popover
        isOpen={demoStep === 1 && !isMobile}
        onClose={skipDemo}
        title="The Nav Sidebar"
        body="This sidebar holds your documents. You can collapse it to focus, and instantly reopen it by clicking anywhere on the thin rail edge."
        position="right"
        targetSelector=".demo-nav-target"
        actionButton={renderDemoAction(false)}
      />

      <Popover
        isOpen={demoStep === 2 && !isMobile}
        onClose={skipDemo}
        title="The Rail System"
        body="Need more room to write? Click here to collapse the AI Hub into a thin visual rail. Click anywhere on the rail to expand it again."
        position="left"
        targetSelector=".demo-rail-target"
        actionButton={renderDemoAction(false)}
      />

      <Popover
        isOpen={demoStep === 3 && !isMobile}
        onClose={skipDemo}
        title="Instant Focus"
        body="You can instantly focus on any panel by Maximizing it. The other panels will automatically yield space and become rails."
        position="bottom"
        targetSelector=".demo-mutex-target"
        actionButton={renderDemoAction(false)}
      />

      <Popover
        isOpen={demoStep === 4 && !isMobile}
        onClose={skipDemo}
        title="Select AI Context"
        body="Check the bubbles next to documents to load them into the AI's active memory. Enjoy your Hub!"
        position="right"
        targetSelector=".demo-context-target"
        actionButton={renderDemoAction(true)}
      />

      {/* Mobile Guided First-Time Demo */}
      <Popover
        isOpen={demoStep === 0 && isMobile}
        onClose={skipDemo}
        title="Open the Editor"
        body="Tap anywhere on a document card to open the Document Editor where you can read and write."
        position="bottom"
        targetSelector=".hub-doc-row-wrapper"
        offset={20}
        actionButton={renderDemoAction(false)}
      />

      <Popover
        isOpen={demoStep === 1 && isMobile}
        onClose={skipDemo}
        title="Select AI Context"
        body="Tap the checkboxes on the left to load specific documents into the AI's active memory."
        position="right"
        targetSelector=".docs-list .hub-doc-row-wrapper:first-child .selection-area svg"
        actionButton={renderDemoAction(false)}
      />

      <Popover
        isOpen={demoStep === 2 && isMobile}
        onClose={skipDemo}
        title="Chat with your Docs"
        body="Tap the floating button below to open the AI Assistant and ask questions about your selected context!"
        position="top"
        targetSelector=".global-fab-assistant"
        actionButton={renderDemoAction(true)}
      />
    </div>
  );
}
