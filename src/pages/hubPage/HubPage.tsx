import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Menu as MenuIcon, BrainCircuit, ChevronLeft, ChevronRight } from "lucide-react";
import { useMobile } from "../../hooks/useMobile";

import AppSidebar from "./components/AppSidebar";
import DocumentsGridView from "./components/DocumentsGridView";
import AIAssistantView from "./components/AIAssistantView";
import DocumentPane from "./components/DocumentPane";

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
import { matchesQuery, matchesCategory, getUniqueCategories } from "./utils/docs";
import { CONTEXT_KEY } from "./utils/assistantUtils";
import { parseImportFiles } from "./utils/parseImportFile";

import "./hubPage.scss";

import DashboardView from "./components/DashboardView";
import SettingsView from "./components/SettingsView";
import ImportPreviewDialog from "./components/ImportPreviewDialog";
import type { View } from "./components/AppSidebar";

const HUB_VIEWS: readonly View[] = [
  "dashboard",
  "documents",
  "favorites",
  "assistant",
  "settings",
];

function normalizeHubView(raw: unknown): View {
  return typeof raw === "string" && (HUB_VIEWS as readonly string[]).includes(raw)
    ? (raw as View)
    : "dashboard";
}

export default function HubPage() {
  const { user, toggleFavorite: globalToggleFavorite, favoritesMap: favorites } = useAuth();
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
          if (newView === "favorites") setCategoryFilter(null);
          setHubView(newView);
        }
      });
      return;
    }

    setIsCreating(false);
    setActiveDocId(null);
    setIsPaneDirty(false);
    if (newView === "favorites") setCategoryFilter(null);
    setHubView(newView);
  }

  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [docViewMode, setDocViewMode] = useState<"grid" | "list">("grid");
  const [docDrawerFullscreen, setDocDrawerFullscreen] = useState<boolean>(() =>
    loadJson<boolean>("docDrawerFullscreen", false)
  );
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
  const filteredDocs = useMemo(() => {
    return orderedDocs.filter((d) => {
      const isFavMatch = view === "favorites" ? !!favorites[d.id] : true;
      return isFavMatch && matchesQuery(d, docSearchQuery) && matchesCategory(d, categoryFilter);
    });
  }, [orderedDocs, docSearchQuery, categoryFilter, view, favorites]);

  const favoritedDocs = useMemo(
    () => orderedDocs.filter((d) => favorites[d.id]),
    [orderedDocs, favorites],
  );

  const categories = useMemo(() => {
    const source = view === "favorites" ? favoritedDocs : orderedDocs;
    return getUniqueCategories(source);
  }, [view, orderedDocs, favoritedDocs]);

  const recentDocs = useMemo(
    () => orderedDocs.slice(0, 5).map((d) => ({ id: d.id, title: d.title })),
    [orderedDocs]
  );

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
    setDocSearchQuery("");
    lastActiveDocIdRef.current = activeDocId;
    setIsCreating(true);
    setActiveDocId(null);
    if (view !== "favorites") {
      setHubView("documents");
    }
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
    if (view !== "favorites") {
      setHubView("documents");
    }
  }

  function toggleDocDrawerFullscreen() {
    setDocDrawerFullscreen((prev) => {
      const next = !prev;
      saveJson("docDrawerFullscreen", next);
      return next;
    });
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

  function handleImport(mode: "append" | "replace", fileType: "json" | "text" | "excel" | "word") {
    const input = document.createElement("input");
    input.type = "file";
    const acceptMap: Record<typeof fileType, string> = {
      json:  ".json",
      text:  ".txt,.md,.rtf",
      excel: ".xlsx",
      word:  ".docx",
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
      if (wasActive) {
        setActiveDocId(null);
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

  const docDrawerOpen =
    (view === "documents" || view === "favorites") &&
    (activeDocId !== null || isCreating);

  const closeDocumentRef = useRef(closeDocument);
  closeDocumentRef.current = closeDocument;

  useEffect(() => {
    if (!docDrawerOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDocumentRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [docDrawerOpen]);

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
          query={docSearchQuery}
          onQueryChange={setDocSearchQuery}
          onNew={openCreate}
          recentDocs={recentDocs}
          sidebarOpen={true}
          isCollapsed={isSidebarCollapsed}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
        />
        {!isMobile && (
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={() => setIsSidebarCollapsed(prev => {
              const next = !prev;
              saveJson("sidebarCollapsed", next);
              return next;
            })}
            aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        )}
      </aside>

      <header className="mobile-top-bar">
        <button className="mobile-hamburger" onClick={() => setIsMobileSidebarOpen(true)} aria-label="Open menu">
          <MenuIcon size={22} />
        </button>
        <div className="mobile-logo">
          <BrainCircuit size={18} />
          <span>InsightDesk</span>
        </div>
      </header>

      <main className="hub-main">
        <div className="hub-main-layout">
          <div
            ref={contentRef}
            className="hub-content"
            tabIndex={-1}
            role="main"
            aria-label={view === "documents" ? "Documents" : view === "favorites" ? "Favorites" : view === "assistant" ? "AI Assistant" : view === "dashboard" ? "Dashboard" : "Content"}
          >
            {view === "dashboard" && (
              <DashboardView
                onViewAllDocuments={() => setHubView("documents")}
                onNewDocument={openCreate}
                onOpenDocument={(id) => openDocument(id)}
                onExport={handleExport}
                onImport={handleImport}
                isAdmin={isAdmin}
              />
            )}
            {(view === "documents" || view === "favorites") && (
              <DocumentsGridView
                docs={filteredDocs}
                favorites={favorites}
                categories={categories}
                categoryFilter={categoryFilter}
                onCategoryFilterChange={setCategoryFilter}
                onOpen={openDocument}
                onToggleFavorite={globalToggleFavorite}
                viewMode={docViewMode}
                onViewModeChange={setDocViewMode}
                searchQuery={docSearchQuery}
                onSearchChange={setDocSearchQuery}
                onNew={openCreate}
                onExport={handleExport}
                onImport={handleImport}
                isAdmin={isAdmin}
                loading={docsLoading}
              />
            )}

            {view === "assistant" && (
              <AIAssistantView
                docs={docs}
                selectedIds={selectedIds}
                onSelectDocuments={() => setHubView("documents")}
                onNew={openCreate}
                onToggleSelected={(id) => {
                  setSelectedIds((prev) => {
                    const next = prev.includes(id)
                      ? prev.filter((x) => x !== id)
                      : [...prev, id];
                    saveJson(CONTEXT_KEY, next);
                    return next;
                  });
                }}
                onClearSelection={() => {
                  setSelectedIds([]);
                  saveJson(CONTEXT_KEY, []);
                }}
              />
            )}

            {view === "settings" && (
              <SettingsView isAdmin={isAdmin} />
            )}

          </div>
        </div>

        {docDrawerOpen && (
          <>
            <div
              className="doc-modal-overlay"
              onClick={closeDocument}
              aria-hidden="true"
            />
            <div
              className={`doc-modal ${docDrawerFullscreen ? "doc-modal--fullscreen" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="doc-drawer-title"
            >
              <DocumentPane
                key={isCreating ? "creating" : (activeDoc?.id ?? "empty")}
                doc={activeDoc}
                canEdit={isAdmin}
                isCreating={isCreating}
                variant="drawer"
                onClose={closeDocument}
                onCancelCreate={() => {
                  setIsPaneDirty(false);
                  setIsCreating(false);
                  setActiveDocId(lastActiveDocIdRef.current);
                }}
                onCreated={handleCreated}
                hasDocs={docs.length > 0}
                loading={docsLoading}
                onSaved={(updated) =>
                  setDocs((p) =>
                    p.map((d) => (d.id === updated.id ? updated : d))
                  )
                }
                onDelete={onDelete}
                onDirtyChange={setIsPaneDirty}
                isMaximized={docDrawerFullscreen}
                {...(!isMobile && { onToggleMaximize: toggleDocDrawerFullscreen })}
              />
            </div>
          </>
        )}
      </main>

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
