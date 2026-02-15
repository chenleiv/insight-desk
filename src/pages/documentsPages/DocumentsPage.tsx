import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import DocumentsList from "./components/DocumentList";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import "./documentsPage.scss";
import {
  deleteDocument,
  importDocumentsBulk,
  type DocumentItem,
} from "../../api/documentsClient";
import useConfirm from "../../hooks/useConfirm";

import { useAuth } from "../../auth/useAuth";
import { downloadExport } from "../../api/downloadExport";
import { normalizeImportedDocuments } from "./utils/documentsPageHelpers";
import { applyOrder, normalizeOrder, sameArray } from "./utils/ordering";
import { saveJson, scopedKey } from "../../utils/storage";
import { useStatus } from "../../components/statusBar/useStatus";
import DocumentPane from "./components/DocumentPane";
import DocumentsSidebar from "./components/DocumentsSidebar";
import { useDocuments } from "../../context/DocumentsContext";
import { ChevronLeft, X } from "lucide-react";

export default function DocumentsPage() {
  const { user } = useAuth();
  const status = useStatus();

  const orderKey = scopedKey("documentsOrder", user?.email);

  const navigate = useNavigate();
  const confirm = useConfirm();
  const location = useLocation();

  const isAdmin = user?.role === "admin";

  const [query, setQuery] = useState("");
  const {
    docs,
    setDocs,
    loadDocuments,
    loading: docsLoading,
    error: docsError,
  } = useDocuments();
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [showForbidden, setShowForbidden] = useState(false);
  const [activeDocId, setActiveDocId] = useState<number | null>(null);
  const [isPaneDirty, setIsPaneDirty] = useState(false);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);

  const { toggleFavorite: globalToggleFavorite } = useAuth();

  // Derive favorites from user object in AuthContext
  const favorites = (() => {
    const favMap: Record<string | number, boolean> = {};
    user?.favorites?.forEach((id) => (favMap[id] = true));
    return favMap;
  })();

  const lastActiveDocIdRef = useRef<number | null>(null);

  const activeDoc = (() => {
    if (activeDocId == null) return null;
    return docs.find((d) => d.id === activeDocId) ?? null;
  })();

  const load = useCallback(async () => {
    setError(null);
    await loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (docs.length > 0) {
      setOrder((prev) => {
        const next = normalizeOrder(prev, docs);
        if (!sameArray(next, prev)) saveJson(orderKey, next);
        return next;
      });

      setActiveDocId((prev) => {
        if (prev == null) {
          return docs.length > 0 ? docs[0].id : null;
        }
        return docs.some((d) => d.id === prev) ? prev : (docs[0]?.id ?? null);
      });
    }
  }, [docs, orderKey]);

  // Handle errors from the context if any
  useEffect(() => {
    if (docsError) setError(docsError);
  }, [docsError]);

  useEffect(() => {
    if ((location.state as { forbidden?: boolean } | null)?.forbidden) {
      setShowForbidden(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate]);

  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  function handleBackToList() {
    setMobileView("list");
    dismissHint();
  }

  const [showMobileHint, setShowMobileHint] = useState(false);

  useEffect(() => {
    const hasSeen = localStorage.getItem("documents_mobile_hint");
    if (!hasSeen && mobileView === "detail") {
      setShowMobileHint(true);
    }
  }, [mobileView]);

  function dismissHint() {
    setShowMobileHint(false);
    localStorage.setItem("documents_mobile_hint", "true");
  }

  function handleCreated(doc: DocumentItem) {
    setIsCreating(false);

    setDocs((prev) => [doc, ...prev]);

    setOrder((prev) => {
      const without = prev.filter((x) => x !== doc.id);
      const next = [doc.id, ...without];
      saveJson(orderKey, next);
      return next;
    });

    setActiveDocId(doc.id);
    setMobileView("detail");
  }

  async function openCreate() {
    if (isPaneDirty) {
      const ok = await confirm({
        title: "Unsaved Changes",
        message:
          "You have unsaved changes. Are you sure you want to discard them?",
        confirmLabel: "Discard",
        cancelLabel: "Stay",
        variant: "danger",
      });
      if (!ok) return;
    }
    setQuery("");
    lastActiveDocIdRef.current = activeDocId ?? null;
    setIsCreating(true);
    setActiveDocId(null);
    setMobileView("detail");
  }

  function onCancelCreate() {
    setIsCreating(false);

    const fallback = lastActiveDocIdRef.current ?? orderedDocs[0]?.id ?? null;

    setActiveDocId(fallback);
    if (fallback) {
      setMobileView("detail");
    } else {
      setMobileView("list");
    }
  }

  async function openDocument(id: number) {
    if (id === activeDocId && !isCreating) {
      setMobileView("detail");
      return;
    }

    if (isPaneDirty) {
      const ok = await confirm({
        title: "Unsaved Changes",
        message:
          "You have unsaved changes. Are you sure you want to discard them?",
        confirmLabel: "Discard",
        cancelLabel: "Stay",
        variant: "danger",
      });
      if (!ok) return;
    }

    setIsCreating(false);
    setActiveDocId(id);
    setMobileView("detail");
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    if (active.id === over.id) return;

    setOrder((prev) => {
      const oldIndex = prev.indexOf(active.id as number);
      const newIndex = prev.indexOf(over.id as number);

      if (oldIndex === -1 || newIndex === -1) return prev;

      const next = arrayMove(prev, oldIndex, newIndex);
      saveJson(orderKey, next);
      return next;
    });
  }

  async function toggleFavorite(id: number) {
    try {
      await globalToggleFavorite(id);
    } catch (e) {
      console.error(e);
      status.show({
        kind: "error",
        title: "Update failed",
        message: "Failed to update favorites.",
      });
    }
  }

  function toggleCardMenu(id: number) {
    setOpenMenuId((prev) => (prev === id ? null : id));
  }

  async function onDelete(doc: DocumentItem) {
    const ok = await confirm({
      title: "Delete document",
      message: `Are you sure you want to delete "${doc.title}"? This cannot be undone.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      variant: "danger",
    });
    if (!ok) return;

    setError(null);

    try {
      await deleteDocument(doc.id);
      status.show({ kind: "success", message: "Document deleted." });

      const wasActive = activeDocId === doc.id;

      setDocs((prev) => prev.filter((d) => d.id !== doc.id));

      setOrder((prev) => {
        const next = prev.filter((x) => x !== doc.id);
        saveJson(orderKey, next);
        return next;
      });

      if (wasActive) {
        setActiveDocId(() => {
          const nextOrdered = orderedDocs.filter((d) => d.id !== doc.id);
          return nextOrdered[0]?.id ?? null;
        });
        setMobileView("list");
      }
    } catch (e) {
      status.show({
        kind: "error",
        title: "Delete failed",
        message: e instanceof Error ? e.message : "Unknown error",
        timeoutMs: 0,
      });
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setOpenMenuId(null);
    }
  }

  const orderedDocs = applyOrder(docs, order);
  const filteredDocs = (() => {
    let result = orderedDocs;

    if (showOnlyFavorites) {
      result = result.filter((d) => favorites[d.id]);
    }

    const q = query.toLowerCase().trim();
    if (!q) return result;

    return result.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        d.summary.toLowerCase().includes(q) ||
        d.content.toLowerCase().includes(q),
    );
  })();

  const regularDocs = filteredDocs;

  async function onExport() {
    try {
      await downloadExport();
      status.show({ kind: "success", message: "Export started." });
    } catch (e) {
      status.show({
        kind: "error",
        title: "Export failed",
        message: e instanceof Error ? e.message : "Unknown error",
        timeoutMs: 0,
      });
    }
  }

  async function requestImport(mode: "merge" | "replace") {
    if (!isAdmin) {
      status.show({
        kind: "error",
        title: "Forbidden",
        message: "This action is available to admins only.",
      });
      return;
    }

    if (mode === "replace") {
      const ok = await confirm({
        title: "Replace all documents?",
        message:
          "This will delete all existing documents and replace them with the imported file. This action cannot be undone.",
        confirmLabel: "Replace",
        cancelLabel: "Cancel",
        variant: "danger",
      });

      if (!ok) return;
    }

    await onImport(mode);
  }

  async function onImport(mode: "merge" | "replace") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";

    input.onchange = async () => {
      setError(null);

      try {
        const file = input.files?.[0];
        if (!file) return;

        const text = await file.text();
        const parsed = JSON.parse(text);
        const documents = normalizeImportedDocuments(parsed);

        if (documents.length === 0) {
          setError(
            'Import file must be a JSON array of documents (or { "documents": [...] }).',
          );
          return;
        }

        await importDocumentsBulk({ mode, documents });
        await load();
        status.show({ kind: "success", message: "Import completed." });
      } catch (e) {
        status.show({
          kind: "error",
          title: "Import failed",
          message: e instanceof Error ? e.message : "Unknown error",
          timeoutMs: 0,
        });
        setError(e instanceof Error ? e.message : "Import failed");
      } finally {
        input.value = "";
      }
    };

    input.click();
  }

  return (
    <div
      className={`documents-layout ${mobileView === "detail" ? "mobile-view-detail" : "mobile-view-list"}`}
      role="presentation"
    >
      <div className="documents-sidebar">
        <DocumentsSidebar
          isAdmin={isAdmin}
          query={query}
          onQueryChange={setQuery}
          error={error}
          showForbidden={showForbidden}
          onCloseForbidden={() => setShowForbidden(false)}
          onNew={openCreate}
          onExport={() => void onExport()}
          onImport={(mode) => void requestImport(mode)}
          showOnlyFavorites={showOnlyFavorites}
          onToggleFavorites={() => setShowOnlyFavorites((prev) => !prev)}
        >
          <DocumentsList
            docs={regularDocs}
            activeDocId={activeDocId}
            favorites={favorites}
            isAdmin={isAdmin}
            openMenuId={openMenuId}
            onToggleMenu={toggleCardMenu}
            onCloseMenu={() => setOpenMenuId(null)}
            onOpen={(id) => openDocument(id)}
            onToggleFavorite={toggleFavorite}
            onDelete={onDelete}
            onDragEnd={onDragEnd}
            loading={docsLoading}
          />
        </DocumentsSidebar>
      </div>

      <section className="documents-pane">
        <DocumentPane
          key={isCreating ? "creating" : (activeDoc?.id ?? "empty")}
          doc={activeDoc}
          canEdit={isAdmin}
          isCreating={isCreating}
          onCancelCreate={() => onCancelCreate()}
          onCreated={handleCreated}
          hasDocs={docs.length > 0}
          loading={docsLoading}
          onSaved={(updated) => {
            setDocs((prev) =>
              prev.map((d) => (d.id === updated.id ? updated : d)),
            );
          }}
          showMobileHint={showMobileHint}
          onDismissHint={dismissHint}
          onDirtyChange={setIsPaneDirty}
        />
      </section>

      {mobileView === "detail" && (
        <button
          onClick={handleBackToList}
          className="mobile-context-close-btn"
          aria-label="Back to list"
        >
          <X />
        </button>
      )}
    </div>
  );
}
