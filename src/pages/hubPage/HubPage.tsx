import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useResize } from "../../hooks/useResize";
import { useMobile } from "../../hooks/useMobile";

import TopBar from "./components/layout/TopBar";
import AIAssistantView from "./components/views/AIAssistantView";
import DocumentPane from "./components/documents/DocumentPane";
import DocPanel from "./components/documents/DocPanel";

import { useDocuments, useSetDocs } from "../../context/DocumentsContext";
import { useAuth } from "../../auth/useAuth";
import { DEMO_LIMITS } from "../../auth/demoLimits";
import { useStatus } from "../../components/statusBar/useStatus";
import useConfirm from "../../hooks/useConfirm";

import { saveJson, loadJson, scopedKey } from "../../utils/storage";
import {
  deleteDocument,
  type DocumentItem,
} from "../../api/documentsClient";
import { paramsForView, viewFromParams, type ActiveView } from "./utils/hubView";

import "./hubPage.scss";
import "./components/documents/docPanel.scss";

import DashboardView from "./components/views/DashboardView";
import SettingsView from "./components/views/SettingsView";
import QualityView from "./components/views/QualityView";
import ImportPreviewDialog from "./components/dialogs/ImportPreviewDialog";
import MobileDrawer from "./components/layout/MobileDrawer";
import DemoBanner from "./components/layout/DemoBanner";
import { useDocumentOrdering } from "./hooks/useDocumentOrdering";
import { useImportExport } from "./hooks/useImportExport";
import { useUnsavedChangesGuard } from "./hooks/useUnsavedChangesGuard";
import { WelcomeModal } from "./components/dialogs/WelcomeModal";
import { TourOverlay } from "./components/dialogs/TourOverlay";
import { HUB_TOUR_STEPS } from "./components/dialogs/tourSteps";

export default function HubPage() {
  const { user, logout, toggleFavorite, favoritesMap: favorites } = useAuth();
  const status = useStatus();
  const confirm = useConfirm();
  const isMobile = useMobile(767);

  const isAdmin = user?.role === "admin";
  const isDemo = user?.role === "demo";
  // Demo visitors edit their own copy of the documents; admin settings stay read-only for them.
  const canEditDocs = isAdmin || isDemo;
  // Aggregate quality metrics; the server returns 403 to viewers.
  const canViewQuality = isAdmin || isDemo;
  const orderKey = scopedKey("documentsOrder", user?.email);

  const { docs, loading: docsLoading, error: docsError } = useDocuments();
  const setDocs = useSetDocs();

  const demoWorkspaceFull = isDemo && docs.length >= DEMO_LIMITS.documents;
  const canCreateDocs = canEditDocs && !demoWorkspaceFull;
  const createDisabledLabel = demoWorkspaceFull
    ? `Demo limit: ${DEMO_LIMITS.documents} documents`
    : "Admin only";

  const { orderedDocs, setOrder } = useDocumentOrdering(docs, orderKey);
  const { handleExport, handleImport, importPreview, setImportPreview, doImport } = useImportExport();

  const PANEL_DEFAULT_WIDTH = 320;
  const PANEL_COLLAPSE_THRESHOLD = 130;

  const {
    isDirty: isPaneDirty,
    setIsDirty: setIsPaneDirty,
    clearDirty,
    guardDirty,
  } = useUnsavedChangesGuard();
  const [isDocPanelCollapsed, setIsDocPanelCollapsed] = useState<boolean>(() =>
    loadJson<boolean>("docPanelCollapsed", true)
  );
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  // The new-document form is local only and ends on any navigation, including back/forward.
  const [creatingKey, setCreatingKey] = useState<string | null>(null);
  const urlView = viewFromParams(searchParams);
  // A document id in the URL that no longer exists (deleted, or a stale link).
  const missingDocId =
    urlView.kind === "doc" && docs.length > 0 && !docs.some((d) => d.id === urlView.id)
      ? urlView.id
      : null;
  const activeView: ActiveView =
    creatingKey === location.key ? { kind: "creating" }
    : missingDocId ? { kind: "ai" }
    : urlView.kind === "quality" && !canViewQuality ? { kind: "ai" }
    : urlView;

  // Each view change is a history entry, so back/forward move between views.
  function setActiveView(view: ActiveView, options?: { replace?: boolean }) {
    if (view.kind === "creating") {
      setCreatingKey(location.key);
      return;
    }
    setCreatingKey(null);
    const next = paramsForView(view);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, options);
  }

  useEffect(() => {
    if (missingDocId) setSearchParams(new URLSearchParams(), { replace: true });
  }, [missingDocId, setSearchParams]);

  const [mobileDocPickerOpen, setMobileDocPickerOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem("insight-desk:welcomed"));
  const [showTour, setShowTour] = useState(false);

  const savedPanelWidth = Math.max(
    PANEL_COLLAPSE_THRESHOLD + 1,
    loadJson<number>("docPanelWidth", PANEL_DEFAULT_WIDTH)
  );
  const { width: docPanelWidth, setWidth: setDocPanelWidth, startResize } = useResize(
    savedPanelWidth, PANEL_COLLAPSE_THRESHOLD, 500, false
  );

  const [prevDocPanelWidth, setPrevDocPanelWidth] = useState(docPanelWidth);

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

  function goToAI() {
    void guardDirty().then((ok) => {
      if (ok) setActiveView({ kind: "ai" });
    });
  }

  function goToDashboard() {
    if (activeView.kind === "dashboard") { setActiveView({ kind: "ai" }); return; }
    void guardDirty().then((ok) => { if (ok) setActiveView({ kind: "dashboard" }); });
  }

  function goToQuality() {
    if (activeView.kind === "quality") { setActiveView({ kind: "ai" }); return; }
    void guardDirty().then((ok) => { if (ok) setActiveView({ kind: "quality" }); });
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

  // Logout ends the session and the hub unmounts before any navigation blocker runs,
  // so unsaved changes are confirmed here first.
  function signOut() {
    void guardDirty().then((ok) => { if (ok) void logout(); });
  }

  function closeView() {
    void guardDirty().then((ok) => { if (ok) setActiveView({ kind: "ai" }); });
  }

  function handleCreated(doc: DocumentItem) {
    clearDirty();
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
      // Replace, so Back does not return to the deleted document.
      if (wasActive) setActiveView({ kind: "ai" }, { replace: true });
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
    activeDocId,
    onOpenDocument: goToDocument,
    onNew: goToCreate,
    canCreate: canCreateDocs,
    createDisabledLabel,
    onToggleFavorite: toggleFavorite,
    loading: docsLoading,
  };

  return (
    <div className="hub-layout">

      {isDemo && <DemoBanner />}

      <TopBar
        activeView={activeView.kind}
        onOpenDashboard={goToDashboard}
        onOpenSettings={goToSettings}
        {...(canViewQuality ? { onOpenQuality: goToQuality } : {})}
        onOpenAI={goToAI}
        isMobile={isMobile}
        onMenuClick={() => setDrawerOpen(true)}
        onSignOut={signOut}
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
            <AIAssistantView />
          )}
          {activeView.kind === "dashboard" && (
            <div className="hub-view-scroll">
              <DashboardView
                onNewDocument={() => void goToCreate()}
                onOpenDocument={goToDocument}
                onExport={handleExport}
                onImport={handleImport}
                canEdit={canEditDocs}
                canCreate={canCreateDocs}
                createDisabledLabel={createDisabledLabel}
                canImport={isAdmin}
              />
            </div>
          )}
          {activeView.kind === "settings" && (
            <div className="hub-view-scroll">
              <SettingsView showAdminTabs={isAdmin || isDemo} adminReadOnly={isDemo} />
            </div>
          )}
          {activeView.kind === "quality" && (
            <div className="hub-view-scroll">
              <QualityView isDemo={isDemo} />
            </div>
          )}
          {(activeView.kind === "doc" || activeView.kind === "creating") && (
            <DocumentPane
              key={activeView.kind === "creating" ? "creating" : activeView.id}
              doc={activeDoc}
              canEdit={canEditDocs}
              maxContentLength={isDemo ? DEMO_LIMITS.contentLength : undefined}
              maxAttachments={isDemo ? DEMO_LIMITS.attachmentsPerDocument : undefined}
              isCreating={activeView.kind === "creating"}
              onCancelCreate={() => {
                clearDirty();
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

          {activeView.kind === "doc" && (
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
          {...(canViewQuality ? { onQuality: goToQuality } : {})}
          onClose={() => setDrawerOpen(false)}
          onSignOut={signOut}
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
        <WelcomeModal
          onClose={() => {
            localStorage.setItem("insight-desk:welcomed", "1");
            setShowWelcome(false);
          }}
          onStartTour={() => {
            localStorage.setItem("insight-desk:welcomed", "1");
            setShowWelcome(false);
            if (isDocPanelCollapsed) {
              handleToggleDocPanel();
              setTimeout(() => setShowTour(true), 320);
            } else {
              setShowTour(true);
            }
          }}
        />
      )}

      {showTour && <TourOverlay steps={HUB_TOUR_STEPS} onDone={() => setShowTour(false)} />}

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
