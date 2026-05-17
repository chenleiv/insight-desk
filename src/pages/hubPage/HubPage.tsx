import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Menu as MenuIcon, BrainCircuit, ChevronLeft } from "lucide-react";
import { useMobile } from "../../hooks/useMobile";

import AppSidebar from "./components/AppSidebar";
import AIAssistantView from "./components/AIAssistantView";
import DocumentPane from "./components/DocumentPane";
import DocPanel from "./components/DocPanel";

import { useDocuments, useSetDocs, DOCUMENTS_QUERY_KEY } from "../../context/DocumentsContext";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/useAuth";
import { useStatus } from "../../components/statusBar/useStatus";
import useConfirm from "../../hooks/useConfirm";

import { normalizeOrder, sameArray, applyOrder } from "./utils/ordering";
import { saveJson, loadJson, scopedKey } from "../../utils/storage";
import {
  deleteDocument,
  exportDocuments,
  importDocumentsBulk,
  type DocumentItem,
  type DocumentInput,
} from "../../api/documentsClient";
import { CONTEXT_KEY } from "./utils/assistantUtils";
import { parseImportFiles } from "./utils/parseImportFile";

import "./hubPage.scss";
import "./components/docPanel.scss";

import DashboardView from "./components/DashboardView";
import SettingsView from "./components/SettingsView";
import ImportPreviewDialog from "./components/ImportPreviewDialog";
import type { View } from "./components/AppSidebar";

const HUB_VIEWS: readonly View[] = ["dashboard", "assistant", "settings"];

function normalizeHubView(raw: unknown): View {
  return typeof raw === "string" && (HUB_VIEWS as readonly string[]).includes(raw)
    ? (raw as View)
    : "dashboard";
}

export default function HubPage() {
  const { user, toggleFavorite, favoritesMap: favorites } = useAuth();
  const status = useStatus();
  const confirm = useConfirm();
  const isMobile = useMobile(1024);

  const isAdmin = user?.role === "admin";
  const orderKey = scopedKey("documentsOrder", user?.email);
  const hubViewKey = scopedKey("hubView", user?.email);

  const { docs, loading: docsLoading, error: docsError } = useDocuments();
  const setDocs = useSetDocs();
  const queryClient = useQueryClient();

  const [view, setView] = useState<View>(() =>
    normalizeHubView(loadJson(hubViewKey, "dashboard")),
  );

  const setHubView = useCallback(
    (next: View) => {
      setView(next);
      saveJson(hubViewKey, next);
    },
    [hubViewKey],
  );

  useEffect(() => {
    setView(normalizeHubView(loadJson(hubViewKey, "dashboard")));
  }, [hubViewKey]);

  function handleViewChange(newView: View) {
    if (isPaneDirty) {
      void confirm({
        title: "Unsaved Changes",
        message: "Discard unsaved changes?",
        confirmLabel: "Discard",
        variant: "danger",
      }).then((ok) => {
        if (ok) {
          setIsPaneDirty(false);
          setIsCreating(false);
          setActiveDocId(null);
          setHubView(newView);
        }
      });
      return;
    }
    setIsCreating(false);
    setActiveDocId(null);
    setIsPaneDirty(false);
    setHubView(newView);
  }

  const contentRef = useRef<HTMLDivElement>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    loadJson<string[]>(CONTEXT_KEY, [])
  );
  const [isCreating, setIsCreating] = useState(false);
  const [isPaneDirty, setIsPaneDirty] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() =>
    loadJson<boolean>("sidebarCollapsed", false)
  );
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDocPanelCollapsed, setIsDocPanelCollapsed] = useState<boolean>(() =>
    loadJson<boolean>("docPanelCollapsed", true)
  );
  const [mobileDocPickerOpen, setMobileDocPickerOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<{ mode: "append" | "replace"; docs: Partial<DocumentInput>[] } | null>(null);
  const lastActiveDocIdRef = useRef<string | null>(null);

  const activeDoc = useMemo(() => {
    if (activeDocId == null) return null;
    return docs.find((d) => d.id === activeDocId) ?? null;
  }, [activeDocId, docs]);

  useEffect(() => {
    if (docs.length > 0) {
      setOrder((prev) => {
        const next = normalizeOrder(prev, docs);
        if (!sameArray(next, prev)) saveJson(orderKey, next);
        return next;
      });
      setActiveDocId((prev) => {
        if (prev != null) {
          return docs.some((d) => d.id === prev) ? prev : (docs[0]?.id ?? null);
        }
        return null;
      });
    }
  }, [docs, orderKey]);

  useEffect(() => {
    if (docsError) status.show({ kind: "error", message: docsError });
  }, [docsError, status]);

  useEffect(() => {
    contentRef.current?.focus({ preventScroll: true });
  }, [view]);

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

  const orderedDocs = useMemo(() => applyOrder(docs, order), [docs, order]);

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

  async function openCreate() {
    if (isPaneDirty) {
      const ok = await confirm({
        title: "Unsaved Changes",
        message: "Discard unsaved changes?",
        confirmLabel: "Discard",
        variant: "danger",
      });
      if (!ok) return;
      setIsPaneDirty(false);
    }
    lastActiveDocIdRef.current = activeDocId;
    setIsCreating(true);
    setActiveDocId(null);
  }

  function handleCreated(doc: DocumentItem) {
    setIsPaneDirty(false);
    setIsCreating(false);
    setDocs((prev) => [doc, ...prev]);
    setOrder((prev) => {
      const next = [doc.id, ...prev.filter((x) => x !== doc.id)];
      saveJson(orderKey, next);
      return next;
    });
    setActiveDocId(doc.id);
  }

  function openDocument(id: string) {
    if (isPaneDirty) {
      void confirm({
        title: "Unsaved Changes",
        message: "Discard unsaved changes?",
        confirmLabel: "Discard",
        variant: "danger",
      }).then((ok) => {
        if (ok) doOpen(id);
      });
      return;
    }
    doOpen(id);
  }

  function doOpen(id: string) {
    setIsPaneDirty(false);
    setIsCreating(false);
    setActiveDocId(id);
    setMobileDocPickerOpen(false);
  }

  function closeDocument() {
    if (isPaneDirty) {
      void confirm({
        title: "Unsaved Changes",
        message: "Discard unsaved changes?",
        confirmLabel: "Discard",
        variant: "danger",
      }).then((ok) => {
        if (ok) doCloseDocument();
      });
      return;
    }
    doCloseDocument();
  }

  function doCloseDocument() {
    setIsPaneDirty(false);
    setIsCreating(false);
    setActiveDocId(lastActiveDocIdRef.current);
  }

  async function handleExport() {
    try {
      const data = await exportDocuments();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "documents-export.json";
      a.click();
      URL.revokeObjectURL(url);
      status.show({ kind: "success", message: "Documents exported." });
    } catch (e) {
      status.show({ kind: "error", title: "Export failed", message: e instanceof Error ? e.message : "Error" });
    }
  }

  async function doImport(mode: "append" | "replace", documents: DocumentInput[]) {
    const result = await importDocumentsBulk({ mode, documents });
    await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
    status.show({ kind: "success", message: `Imported ${result.inserted} documents.` });
  }

  function handleImport(mode: "append" | "replace", fileType: "json" | "text") {
    const input = document.createElement("input");
    input.type = "file";
    const acceptMap: Record<typeof fileType, string> = {
      json: ".json",
      text: ".txt,.md",
    };
    input.accept = acceptMap[fileType];
    input.multiple = fileType !== "json";
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files ?? []);
      if (files.length === 0) return;
      try {
        const parsed = await parseImportFiles(files);
        const needsPreview = parsed.some(
          (d) => !d.title?.trim() || !d.category?.trim() || !d.summary?.trim() || !d.content?.trim()
        );
        if (needsPreview) {
          setImportPreview({ mode, docs: parsed });
        } else {
          await doImport(mode, parsed as DocumentInput[]);
        }
      } catch (e) {
        status.show({ kind: "error", title: "Import failed", message: e instanceof Error ? e.message : "Error" });
      }
    };
    input.click();
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
      if (wasActive) setActiveDocId(null);
      status.show({ kind: "success", message: "Document deleted." });
    } catch (e) {
      status.show({
        kind: "error",
        title: "Delete failed",
        message: e instanceof Error ? e.message : "Error",
      });
    }
  }

  const docOpen = activeDocId !== null || isCreating;

  const closeDocumentRef = useRef(closeDocument);
  useEffect(() => { closeDocumentRef.current = closeDocument; });

  useEffect(() => {
    if (!docOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDocumentRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [docOpen]);

  const docPanelProps = {
    docs: orderedDocs,
    favorites,
    selectedIds,
    activeDocId,
    onOpenDocument: openDocument,
    onNew: openCreate,
    onToggleFavorite: toggleFavorite,
    onToggleSelected: handleToggleSelected,
    onClearSelection: handleClearSelection,
    loading: docsLoading,
  };

  return (
    <div className={`hub-layout hub-layout-refactored ${isMobileSidebarOpen ? "mobile-sidebar-open" : ""}`}>

      {isMobileSidebarOpen && (
        <button
          className="mobile-sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      <aside className={`hub-sidebar app-sidebar-wrapper ${isSidebarCollapsed ? "collapsed" : ""}`}>
        <AppSidebar
          view={view}
          onViewChange={handleViewChange}
          isCollapsed={isSidebarCollapsed}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
          onToggleCollapsed={!isMobile ? () => setIsSidebarCollapsed(prev => {
            const next = !prev;
            saveJson("sidebarCollapsed", next);
            return next;
          }) : undefined}
        />
      </aside>

      <header className="mobile-top-bar">
        <button className="mobile-hamburger" onClick={() => setIsMobileSidebarOpen(true)} aria-label="Open menu">
          <MenuIcon size={22} />
        </button>
        <div className="mobile-logo">
          <BrainCircuit size={18} />
          <span>InsightDesk</span>
        </div>
        <button
          className="mobile-docs-btn"
          onClick={() => setMobileDocPickerOpen(true)}
          aria-label="Browse documents"
        >
          <MenuIcon size={20} />
        </button>
      </header>

      <main className="hub-main">
        <div className="hub-main-layout">
          {!isMobile && (
            <div className={`doc-panel-wrapper${isDocPanelCollapsed ? " collapsed" : ""}`}>
              <DocPanel
                {...docPanelProps}
                isCollapsed={isDocPanelCollapsed}
                onToggleCollapsed={() => setIsDocPanelCollapsed(prev => {
                  const next = !prev;
                  saveJson("docPanelCollapsed", next);
                  return next;
                })}
              />
              {!isDocPanelCollapsed && (
                <div
                  className="doc-panel-edge-strip"
                  onClick={() => setIsDocPanelCollapsed(prev => { const next = !prev; saveJson("docPanelCollapsed", next); return next; })}
                  role="button"
                  aria-label="Collapse documents"
                  data-tooltip="Collapse documents"
                  data-tooltip-pos="right"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setIsDocPanelCollapsed(prev => { const next = !prev; saveJson("docPanelCollapsed", next); return next; }); }}
                >
                  <ChevronLeft size={13} className="doc-panel-collapsed-arrow" />
                  <span className="doc-panel-collapsed-label">Documents</span>
                </div>
              )}
            </div>
          )}
          <div
            ref={contentRef}
            className={`hub-content${docOpen ? " hub-content--doc" : ""}`}
            tabIndex={-1}
            role="main"
            aria-label={docOpen ? "Document" : view}
          >
            {docOpen ? (
              <DocumentPane
                key={isCreating ? "creating" : (activeDoc?.id ?? "empty")}
                doc={activeDoc}
                canEdit={isAdmin}
                isCreating={isCreating}
                onCancelCreate={() => {
                  setIsPaneDirty(false);
                  setIsCreating(false);
                  setActiveDocId(lastActiveDocIdRef.current);
                }}
                onCreated={handleCreated}
                hasDocs={docs.length > 0}
                loading={docsLoading}
                onSaved={(updated) =>
                  setDocs((p) => p.map((d) => (d.id === updated.id ? updated : d)))
                }
                onDelete={onDelete}
                onDirtyChange={setIsPaneDirty}
              />
            ) : (
              <>
                {view === "dashboard" && (
                  <DashboardView
                    onViewAllDocuments={openCreate}
                    onNewDocument={openCreate}
                    onOpenDocument={openDocument}
                    onExport={handleExport}
                    onImport={handleImport}
                    isAdmin={isAdmin}
                  />
                )}
                {view === "assistant" && (
                  <AIAssistantView
                    docs={docs}
                    selectedIds={selectedIds}
                    {...(isMobile ? { onOpenMobilePicker: () => setMobileDocPickerOpen(true) } : {})}
                  />
                )}
                {view === "settings" && (
                  <SettingsView isAdmin={isAdmin} />
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {mobileDocPickerOpen && isMobile && (
        <div className="mobile-doc-picker-overlay" onClick={() => setMobileDocPickerOpen(false)}>
          <div className="mobile-doc-picker-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-doc-picker-handle" />
            <DocPanel {...docPanelProps} />
          </div>
        </div>
      )}

      {importPreview && (
        <ImportPreviewDialog
          docs={importPreview.docs}
          onConfirm={async (documents) => {
            setImportPreview(null);
            try {
              await doImport(importPreview.mode, documents);
            } catch (e) {
              status.show({ kind: "error", title: "Import failed", message: e instanceof Error ? e.message : "Error" });
            }
          }}
          onCancel={() => setImportPreview(null)}
        />
      )}
    </div>
  );
}
