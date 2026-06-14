import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  exportDocuments,
  importDocumentsBulk,
  type DocumentInput,
} from "../../../api/documentsClient";
import { DOCUMENTS_QUERY_KEY } from "../../../context/DocumentsContext";
import { useStatus } from "../../../components/statusBar/useStatus";
import { parseImportFiles } from "../utils/parseImportFile";

export function useImportExport() {
  const status = useStatus();
  const queryClient = useQueryClient();
  const [importPreview, setImportPreview] = useState<{
    mode: "append" | "replace";
    docs: Partial<DocumentInput>[];
  } | null>(null);

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
    const acceptMap: Record<typeof fileType, string> = { json: ".json", text: ".txt,.md" };
    input.accept = acceptMap[fileType];
    input.multiple = fileType !== "json";
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files ?? []);
      if (files.length === 0) return;
      try {
        const parsed = await parseImportFiles(files);
        const needsPreview = parsed.some(
          (d) => !d.title?.trim() || !d.category?.trim() || !d.content?.trim()
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

  return { handleExport, handleImport, importPreview, setImportPreview, doImport };
}
