import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AppSidebar from "./components/AppSidebar";
import DocumentsGridView from "./components/DocumentsGridView";
import AIAssistantView from "./components/AIAssistantView";
import DocumentPane from "./components/DocumentPane";

import { useDocuments } from "../../context/DocumentsContext";
import { useAuth } from "../../auth/useAuth";
import { useStatus } from "../../components/statusBar/useStatus";
import useConfirm from "../../hooks/useConfirm";

import { normalizeOrder, sameArray, applyOrder } from "./utils/ordering";
import { saveJson, loadJson, scopedKey } from "../../utils/storage";
import {
  deleteDocument,
  type DocumentItem,
} from "../../api/documentsClient";
import { matchesQuery, matchesCategory, getUniqueCategories } from "./utils/docs";
import { CONTEXT_KEY } from "./utils/assistantUtils";

import "./hubPage.scss";

import DashboardView from "./components/DashboardView";
import type { View } from "./components/AppSidebar";

export default function HubPage() {
  const { user, toggleFavorite: globalToggleFavorite, favoritesMap: favorites } = useAuth();
  const status = useStatus();
  const confirm = useConfirm();

  const isAdmin = user?.role === "admin";
  const orderKey = scopedKey("documentsOrder", user?.email);

  const {
    docs,
    setDocs,
    loadDocuments,
    loading: docsLoading,
    error: docsError,
  } = useDocuments();

  const [view, setView] = useState<View>("dashboard");

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
          if (!docSplitView) setActiveDocId(null);
          setView(newView);
        }
      });
      return;
    }
    
    setIsCreating(false);
    if (!docSplitView && (newView === "documents" || newView === "favorites" || view === newView)) {
      setActiveDocId(null);
    }
    setView(newView);
  }

  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [docViewMode, setDocViewMode] = useState<"grid" | "list">("grid");
  const [docSplitView, setDocSplitView] = useState<boolean>(() =>
    loadJson<boolean>("docSplitView", false)
  );
  const [order, setOrder] = useState<number[]>([]);
  const [activeDocId, setActiveDocId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>(() =>
    loadJson<number[]>(CONTEXT_KEY, [])
  );
  const [isCreating, setIsCreating] = useState(false);
  const [isPaneDirty, setIsPaneDirty] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() =>
    loadJson<boolean>("sidebarCollapsed", false)
  );
  const lastActiveDocIdRef = useRef<number | null>(null);

  const activeDoc = useMemo(() => {
    if (activeDocId == null) return null;
    return docs.find((d) => d.id === activeDocId) ?? null;
  }, [activeDocId, docs]);

  const load = useCallback(async () => {
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

  const categories = useMemo(() => getUniqueCategories(docs), [docs]);

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
    }
    setDocSearchQuery("");
    lastActiveDocIdRef.current = activeDocId;
    setIsCreating(true);
    setActiveDocId(null);
    if (view !== "favorites") {
      setView("documents");
    }
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
  }

  function openDocument(id: number) {
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

  function doOpen(id: number) {
    setIsCreating(false);
    setActiveDocId(id);
    if (view !== "favorites") {
      setView("documents");
    }
  }

  function toggleDocSplitView() {
    setDocSplitView((prev) => {
      const next = !prev;
      saveJson("docSplitView", next);
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
    setIsCreating(false);
    setActiveDocId(lastActiveDocIdRef.current);
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
        setActiveDocId(orderedDocs.find((d) => d.id !== doc.id)?.id ?? null);
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

  return (
    <div className={`hub-layout hub-layout-refactored ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
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
          onToggleCollapse={() => {
            setIsSidebarCollapsed(prev => {
              const next = !prev;
              saveJson("sidebarCollapsed", next);
              return next;
            });
          }}
        />
      </aside>

      <main className="hub-main">
        <div className="hub-main-layout">
          <div
            ref={contentRef}
            className={`hub-content ${view === "documents" && docSplitView ? "with-detail" : ""}`}
            tabIndex={-1}
            role="main"
            aria-label={view === "documents" ? "Documents" : view === "favorites" ? "Favorites" : view === "assistant" ? "AI Assistant" : view === "dashboard" ? "Dashboard" : "Content"}
            style={(view === "documents" || view === "favorites") && !docSplitView && (activeDocId || isCreating) ? { display: "none" } : undefined}
          >
            {view === "dashboard" && (
              <DashboardView
                onViewAllDocuments={() => setView("documents")}
                onNewDocument={openCreate}
                onOpenDocument={(id) => openDocument(id)}
              />
            )}
            {(view === "documents" || view === "favorites") && (docSplitView || !activeDocId && !isCreating) && (
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
                loading={docsLoading}
                splitView={docSplitView}
                onToggleSplitView={toggleDocSplitView}
              />
            )}

            {view === "assistant" && (
              <AIAssistantView
                docs={docs}
                selectedIds={selectedIds}
                onSelectDocuments={() => setView("documents")}
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

          </div>

          {(view === "documents" || view === "favorites") && (docSplitView || activeDocId || isCreating) && (
            <div className={`hub-detail-pane ${!docSplitView ? "hub-detail-pane-full" : ""}`}>
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
                    p.map((d) => (d.id === updated.id ? updated : d))
                  )
                }
                onDelete={onDelete}
                onDirtyChange={setIsPaneDirty}
                {...(!docSplitView && { onBack: closeDocument })}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
