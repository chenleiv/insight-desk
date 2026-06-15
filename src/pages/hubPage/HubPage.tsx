import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useResize } from "../../hooks/useResize";
import { useMobile } from "../../hooks/useMobile";

import TopBar from "./components/layout/TopBar";
import AIAssistantView from "./components/views/AIAssistantView";
import DocumentPane from "./components/documents/DocumentPane";
import DocPanel from "./components/documents/DocPanel";

import { useDocuments, useSetDocs } from "../../context/DocumentsContext";
import { useAuth } from "../../auth/useAuth";
import { useStatus } from "../../components/statusBar/useStatus";
import useConfirm from "../../hooks/useConfirm";

import { sameArray } from "./utils/ordering";
import { saveJson, loadJson, scopedKey } from "../../utils/storage";
import {
  deleteDocument,
  type DocumentItem,
} from "../../api/documentsClient";
import { CONTEXT_KEY } from "./utils/assistantUtils";

import "./hubPage.scss";
import "./components/documents/docPanel.scss";

import DashboardView from "./components/views/DashboardView";
import SettingsView from "./components/views/SettingsView";
import ImportPreviewDialog from "./components/dialogs/ImportPreviewDialog";
import MobileDrawer from "./components/layout/MobileDrawer";
import { useDocumentOrdering } from "./hooks/useDocumentOrdering";
import { useImportExport } from "./hooks/useImportExport";
import { WelcomeModal } from "./components/dialogs/WelcomeModal";

type ActiveView =
  | { kind: "ai" }
  | { kind: "dashboard" }
  | { kind: "settings" }
  | { kind: "doc"; id: string }
  | { kind: "creating" };

export default function HubPage() {
  const { user, toggleFavorite, favoritesMap: favorites } = useAuth();
  const status = useStatus();
  const confirm = useConfirm();
  const isMobile = useMobile(767);

  const isAdmin = user?.role === "admin";
  const orderKey = scopedKey("documentsOrder", user?.email);

  const { docs, loading: docsLoading, error: docsError } = useDocuments();
  const setDocs = useSetDocs();

  const { orderedDocs, setOrder } = useDocumentOrdering(docs, orderKey);
  const { handleExport, handleImport, importPreview, setImportPreview, doImport } = useImportExport();

  const PANEL_DEFAULT_WIDTH = 320;
  const PANEL_COLLAPSE_THRESHOLD = 130;

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    loadJson<string[]>(CONTEXT_KEY, [])
  );
  const [isPaneDirty, setIsPaneDirty] = useState(false);
  const [isDocPanelCollapsed, setIsDocPanelCollapsed] = useState<boolean>(() =>
    loadJson<boolean>("docPanelCollapsed", true)
  );
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>({ kind: "ai" });
  const [mobileDocPickerOpen, setMobileDocPickerOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem("insight-desk:welcomed"));

  const savedPanelWidth = Math.max(
    PANEL_COLLAPSE_THRESHOLD + 1,
    loadJson<number>("docPanelWidth", PANEL_DEFAULT_WIDTH)
  );
  const { width: docPanelWidth, setWidth: setDocPanelWidth, startResize } = useResize(
    savedPanelWidth, PANEL_COLLAPSE_THRESHOLD, 500, false
  );

  const [prevDocs, setPrevDocs] = useState<DocumentItem[]>(docs);
  const [prevDocPanelWidth, setPrevDocPanelWidth] = useState(docPanelWidth);

  // Adjust active view and selection when docs change (avoids setState in useEffect)
  if (docs !== prevDocs) {
    setPrevDocs(docs);
    if (docs.length > 0) {
      if (activeView.kind === "doc" && !docs.some((d) => d.id === activeView.id)) {
        setActiveView({ kind: "ai" });
      }
      const ids = new Set(docs.map((d) => d.id));
      const nextIds = selectedIds.filter((id) => ids.has(id));
      if (!sameArray(nextIds, selectedIds)) {
        setSelectedIds(nextIds);
        saveJson(CONTEXT_KEY, nextIds);
      }
    }
  }

  // Sync collapse state with panel width during render (avoids setState in useEffect)
  if (docPanelWidth !== prevDocPanelWidth) {
    setPrevDocPanelWidth(docPanelWidth);
    if (!isDocPanelCollapsed && docPanelWidth <= PANEL_COLLAPSE_THRESHOLD) {
      setIsDocPanelCollapsed(true);
      saveJson("docPanelCollapsed", true);
    } else if (isDocPanelCollapsed && docPanelWidth > PANEL_COLLAPSE_THRESHOLD) {
      setIsDocPanelCollapsed(false);
      saveJson("docPanelCollapsed", false);
    }
  }

  const activeDocId = activeView.kind === "doc" ? activeView.id : null;

  const activeDoc = useMemo(
    () => (activeDocId != null ? (docs.find((d) => d.id === activeDocId) ?? null) : null),
    [activeDocId, docs]
  );

  useEffect(() => {
    if (docsError) status.show({ kind: "error", message: docsError });
  }, [docsError, status]);

  const handleToggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      saveJson(CONTEXT_KEY, next);
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedIds([]);
    saveJson(CONTEXT_KEY, []);
  }, []);

  const handleToggleDocPanel = useCallback(() => {
    setIsDocPanelCollapsed((prev) => {
      const next = !prev;
      saveJson("docPanelCollapsed", next);
      return next;
    });
    // When expanding after auto-collapse, restore to a usable width
    if (isDocPanelCollapsed && docPanelWidth <= PANEL_COLLAPSE_THRESHOLD) {
      setDocPanelWidth(PANEL_DEFAULT_WIDTH);
    }
  }, [isDocPanelCollapsed, docPanelWidth, setDocPanelWidth, PANEL_COLLAPSE_THRESHOLD, PANEL_DEFAULT_WIDTH]);

  // Persist panel width to localStorage
  useEffect(() => {
    if (!isDocPanelCollapsed && docPanelWidth > PANEL_COLLAPSE_THRESHOLD) {
      saveJson("docPanelWidth", docPanelWidth);
    }
  }, [docPanelWidth, isDocPanelCollapsed, PANEL_COLLAPSE_THRESHOLD]);

  // Stable ref so handleGripMouseDown never has a stale closure on the toggle handler
  const handleToggleDocPanelRef = useRef(handleToggleDocPanel);
  useEffect(() => { handleToggleDocPanelRef.current = handleToggleDocPanel; });

  const handleGripMouseDown = useCallback((e: React.MouseEvent) => {
    const startX = e.clientX;
    let hasMoved = false;

    const onMouseMove = (me: MouseEvent) => {
      if (Math.abs(me.clientX - startX) > 3) hasMoved = true;
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      setIsDraggingPanel(false);
      if (!hasMoved) handleToggleDocPanelRef.current();
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    setIsDraggingPanel(true);
    startResize(e);
  }, [startResize]);

  async function guardDirty(): Promise<boolean> {
    if (!isPaneDirty) return true;
    const ok = await confirm({
      title: "Unsaved Changes",
      message: "Discard unsaved changes?",
      confirmLabel: "Discard",
      variant: "danger",
    });
    if (ok) setIsPaneDirty(false);
    return ok;
  }

  function goToAI() {
    void guardDirty().then((ok) => {
      if (!ok) return;
      if (activeView.kind === "doc" && activeView.id) {
        const next = [activeView.id];
        setSelectedIds(next);
        saveJson(scopedKey(CONTEXT_KEY, user?.email), next);
      }
      setActiveView({ kind: "ai" });
    });
  }

  function goToDashboard() {
    if (activeView.kind === "dashboard") { setActiveView({ kind: "ai" }); return; }
    void guardDirty().then((ok) => { if (ok) setActiveView({ kind: "dashboard" }); });
  }

  function goToSettings() {
    if (activeView.kind === "settings") { setActiveView({ kind: "ai" }); return; }
    void guardDirty().then((ok) => { if (ok) setActiveView({ kind: "settings" }); });
  }

  async function goToCreate() {
    if (!(await guardDirty())) return;
    setActiveView({ kind: "creating" });
  }

  function goToDocument(id: string) {
    if (isPaneDirty) {
      void guardDirty().then((ok) => { if (ok) { setActiveView({ kind: "doc", id }); setMobileDocPickerOpen(false); } });
      return;
    }
    setActiveView({ kind: "doc", id });
    setMobileDocPickerOpen(false);
  }

  function closeView() {
    void guardDirty().then((ok) => { if (ok) setActiveView({ kind: "ai" }); });
  }

  function handleCreated(doc: DocumentItem) {
    setIsPaneDirty(false);
    setDocs((prev) => [doc, ...prev]);
    setOrder((prev) => {
      const next = [doc.id, ...prev.filter((x) => x !== doc.id)];
      saveJson(orderKey, next);
      return next;
    });
    setActiveView({ kind: "doc", id: doc.id });
  }

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
      if (wasActive) setActiveView({ kind: "ai" });
      status.show({ kind: "success", message: "Document deleted." });
    } catch (e) {
      status.show({
        kind: "error",
        title: "Delete failed",
        message: e instanceof Error ? e.message : "Error",
      });
    }
  }

  const closeViewRef = useRef(closeView);
  useEffect(() => { closeViewRef.current = closeView; });

  useEffect(() => {
    if (activeView.kind === "ai") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeViewRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeView.kind]);

  const docPanelProps = {
    docs: orderedDocs,
    favorites,
    selectedIds,
    activeDocId,
    onOpenDocument: goToDocument,
    onNew: goToCreate,
    onToggleFavorite: toggleFavorite,
    onToggleSelected: handleToggleSelected,
    onClearSelection: handleClearSelection,
    loading: docsLoading,
  };

  return (
    <div className="hub-layout">

      <TopBar
        activeView={activeView.kind}
        onOpenDashboard={goToDashboard}
        onOpenSettings={goToSettings}
        onOpenAI={goToAI}
        isMobile={isMobile}
        onMenuClick={() => setDrawerOpen(true)}
        {...(isMobile ? { onOpenDocPicker: () => setMobileDocPickerOpen(true) } : {})}
      />

      <div className="hub-body">

        {/* Documents sidebar — left, always visible on desktop */}
        {!isMobile && (
          <div
            className={`doc-panel-wrapper${isDocPanelCollapsed ? " collapsed" : ""}`}
            style={
              isDocPanelCollapsed
                ? undefined
                : { width: docPanelWidth, ...(isDraggingPanel ? { transition: "none" } : {}) }
            }
          >
            <DocPanel
              {...docPanelProps}
              isCollapsed={isDocPanelCollapsed}
              onToggleCollapsed={handleToggleDocPanel}
            />
            <div
              className={`doc-panel-grip-handle${isDocPanelCollapsed ? " doc-panel-grip-handle--collapsed-state" : ""}`}
              onMouseDown={handleGripMouseDown}
              role="button"
              aria-label={isDocPanelCollapsed ? "Drag to expand documents panel" : "Drag to resize or click to collapse documents panel"}
              title={isDocPanelCollapsed ? "Drag to expand · Click to expand" : "Drag to resize · Click to collapse"}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleToggleDocPanel(); }}
            >
              <div className="doc-panel-grip-dots">
                <span className="doc-panel-grip-dot" />
                <span className="doc-panel-grip-dot" />
                <span className="doc-panel-grip-dot" />
              </div>
            </div>
          </div>
        )}

        <main className="hub-main">
          {activeView.kind === "ai" && (
            <AIAssistantView
              docs={docs}
              selectedIds={selectedIds}
              {...(isMobile ? { onOpenMobilePicker: () => setMobileDocPickerOpen(true) } : {})}
            />
          )}
          {activeView.kind === "dashboard" && (
            <div className="hub-view-scroll">
              <DashboardView
                onNewDocument={() => void goToCreate()}
                onOpenDocument={goToDocument}
                onExport={handleExport}
                onImport={handleImport}
                isAdmin={isAdmin}
              />
            </div>
          )}
          {activeView.kind === "settings" && (
            <div className="hub-view-scroll">
              <SettingsView isAdmin={isAdmin} />
            </div>
          )}
          {(activeView.kind === "doc" || activeView.kind === "creating") && (
            <DocumentPane
              key={activeView.kind === "creating" ? "creating" : activeView.id}
              doc={activeDoc}
              canEdit={isAdmin}
              isCreating={activeView.kind === "creating"}
              onCancelCreate={() => {
                setIsPaneDirty(false);
                setActiveView({ kind: "ai" });
              }}
              onCreated={handleCreated}
              hasDocs={docs.length > 0}
              loading={docsLoading}
              onSaved={(updated) =>
                setDocs((p) => p.map((d) => (d.id === updated.id ? updated : d)))
              }
              onDelete={onDelete}
              onDirtyChange={setIsPaneDirty}

              onClose={closeView}
            />
          )}

          {activeView.kind === "doc" && !isPaneDirty && (
            <div className="brainy-fab-wrap">
              <button
                type="button"
                className="brainy-fab"
                onClick={goToAI}
                aria-label="Open Brainy AI assistant"
              >
                <MessageCircle size={19} strokeWidth={2.2} />
                <span>Ask Brainy</span>
              </button>
            </div>
          )}

        </main>

      </div>

      {/* Mobile navigation drawer */}
      {drawerOpen && isMobile && (
        <MobileDrawer
          onDashboard={goToDashboard}
          onSettings={goToSettings}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile document picker */}
      {mobileDocPickerOpen && isMobile && (
        <div className="mobile-doc-picker-overlay" onClick={() => setMobileDocPickerOpen(false)}>
          <div className="mobile-doc-picker-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-doc-picker-handle" />
            <DocPanel
              {...docPanelProps}
              onOpenDocument={(id) => { setMobileDocPickerOpen(false); goToDocument(id); }}
              onNew={() => { setMobileDocPickerOpen(false); void goToCreate(); }}
            />
          </div>
        </div>
      )}

      {/* Welcome modal — shown on first visit */}
      {showWelcome && (
        <WelcomeModal onClose={() => {
          localStorage.setItem("insight-desk:welcomed", "1");
          setShowWelcome(false);
        }} />
      )}

      {/* Import preview dialog */}
      {importPreview && (
        <ImportPreviewDialog
          docs={importPreview.docs}
          onConfirm={async (documents) => {
            setImportPreview(null);
            try {
              await doImport(importPreview.mode, documents);
            } catch (e) {
              status.show({
                kind: "error",
                title: "Import failed",
                message: e instanceof Error ? e.message : "Error",
              });
            }
          }}
          onCancel={() => setImportPreview(null)}
        />
      )}

    </div>
  );
}
