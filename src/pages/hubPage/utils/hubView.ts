// The hub's open view, kept in the URL query so refresh and back/forward restore it.
// "creating" is never in the URL: a new-document form is not worth restoring.
// Phones use "new" instead, because Back and the unsaved-changes blocker need a URL of their own.
export type ActiveView =
  | { kind: "ai" }
  | { kind: "documents" }
  | { kind: "new" }
  | { kind: "dashboard" }
  | { kind: "settings" }
  | { kind: "quality" }
  | { kind: "doc"; id: string }
  | { kind: "creating" };

export type UrlView = Exclude<ActiveView, { kind: "creating" }>;

export function viewFromParams(params: URLSearchParams): UrlView {
  const docId = params.get("doc");
  if (docId) return { kind: "doc", id: docId };
  const view = params.get("view");
  if (view === "documents" || view === "new" || view === "dashboard" || view === "settings" || view === "quality") return { kind: view };
  return { kind: "ai" };
}

export function paramsForView(view: UrlView): URLSearchParams {
  if (view.kind === "doc") return new URLSearchParams({ doc: view.id });
  if (view.kind === "ai") return new URLSearchParams();
  return new URLSearchParams({ view: view.kind });
}
