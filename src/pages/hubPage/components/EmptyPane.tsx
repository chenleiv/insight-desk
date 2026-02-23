import React from "react";
import { DocumentDetailSkeleton } from "../../../components/skeleton/Skeleton";

type Props = {
  hasDocs: boolean;
  loading?: boolean | undefined;
};

export const EmptyPane: React.FC<Props> = ({ hasDocs, loading }) => {
  return (
    <div className="doc-pane">
      <div className="doc-pane-empty">
        {loading ? (
          <DocumentDetailSkeleton />
        ) : hasDocs ? (
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
};
