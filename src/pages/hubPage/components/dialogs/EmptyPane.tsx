type Props = {
  hasDocs: boolean;
};

export function EmptyPane({ hasDocs }: Props) {
  return (
    <div className="doc-pane">
      <div className="doc-pane-empty">
        {hasDocs ? (
          <div className="doc-pane-empty-title">Select a document</div>
        ) : (
          <>
            <div className="doc-pane-empty-title">No documents yet</div>
            <div className="doc-pane-empty-sub">
              Create your first document to get started.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
