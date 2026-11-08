import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  exportDocuments,
  importDocumentsBulk,
  type DocumentInput,
} from "../../../api/documentsClient";
import { DOCUMENTS_QUERY_KEY } from "../../../context/DocumentsContext";
import { useStatus } from "../../../components/statusBar/useStatus";
import { parseImportFiles } from "../utils/parseImportFile";
import { friendlyError } from "../../../utils/errorMessage";

export function useImportExport() {
  const status = useStatus();
  const queryClient = useQueryClient();
  const [importPreview, setImportPreview] = useState<{
    mode: "append" | "replace";
    docs: Partial<DocumentInput>[];
  } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  // Set before the first await: two clicks can land before React renders the pending state.
  const exportInFlightRef = useRef(false);
  const importInFlightRef = useRef(false);

  async function handleExport() {
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    setIsExporting(true);
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
      status.show({ kind: "error", title: "Export failed", message: friendlyError(e, "Could not export the documents. Check your connection and try again.") });
    } finally {
      exportInFlightRef.current = false;
      setIsExporting(false);
    }
  }

  function beginImport() {
    if (importInFlightRef.current) return false;
    importInFlightRef.current = true;
    setIsImporting(true);
    return true;
  }

  function endImport() {
    importInFlightRef.current = false;
    setIsImporting(false);
  }

  async function sendImport(mode: "append" | "replace", documents: DocumentInput[]) {
    const result = await importDocumentsBulk({ mode, documents });
    await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
    status.show({ kind: "success", message: `Imported ${result.inserted} documents.` });
  }

  async function doImport(mode: "append" | "replace", documents: DocumentInput[]) {
    if (!beginImport()) return;
    try {
      await sendImport(mode, documents);
    } finally {
      endImport();
    }
  }

  function handleImport(mode: "append" | "replace", fileType: "json" | "text") {
    if (importInFlightRef.current) return;
    const input = document.createElement("input");
    input.type = "file";
    const acceptMap: Record<typeof fileType, string> = { json: ".json", text: ".txt,.md" };
    input.accept = acceptMap[fileType];
    input.multiple = fileType !== "json";
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files ?? []);
      if (files.length === 0 || !beginImport()) return;
      try {
        const parsed = await parseImportFiles(files);
        const needsPreview = parsed.some(
          (d) => !d.title?.trim() || !d.category?.trim() || !d.content?.trim()
        );
        if (needsPreview) {
          setImportPreview({ mode, docs: parsed });
        } else {
          await sendImport(mode, parsed as DocumentInput[]);
        }
      } catch (e) {
        status.show({ kind: "error", title: "Import failed", message: friendlyError(e, "Could not import the documents. Check your connection and try again.") });
      } finally {
        endImport();
      }
    };
    input.click();
  }

  return { handleExport, handleImport, importPreview, setImportPreview, doImport, isExporting, isImporting };
}
