import React from "react";
import { SquarePenIcon } from "lucide-react";

type Props = {
  title: string;
  category?: string | undefined;
  mode: "view" | "edit";
  isCreating: boolean;
  isPending: boolean;
  canEdit: boolean;
  canSave: boolean;
  onEdit: () => void;
  onCancel: () => void;
};

export const DocumentHeader: React.FC<Props> = ({
  title,
  category,
  mode,
  isCreating,
  isPending,
  canEdit,
  canSave,
  onEdit,
  onCancel,
}) => {
  return (
    <div className="doc-pane-top-wrapper">
      <div className="doc-pane-top">
        <div className="doc-pane-title-container">
          <div>
            <h2 className="doc-pane-title">{title}</h2>
            {category ? (
              <h4 className="doc-pane-title small">{category}</h4>
            ) : null}
          </div>
        </div>

        <div className="doc-pane-actions">
          {mode === "view" ? (
            <>
              {canEdit && !isCreating ? (
                <button
                  type="button"
                  className="icon-btn doc-pane-edit"
                  onClick={onEdit}
                  title="Edit"
                  aria-label="Edit"
                >
                  <SquarePenIcon size={22} width={22} />
                </button>
              ) : null}
            </>
          ) : (
            <>
              <button type="submit" className="primary-btn" disabled={!canSave}>
                {isPending ? "Saving..." : "Save"}
              </button>

              <button
                type="button"
                className="primary-btn"
                onClick={onCancel}
                disabled={isPending}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
