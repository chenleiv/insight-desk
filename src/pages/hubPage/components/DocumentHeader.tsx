import React from "react";
import {
  SquarePenIcon,
  Maximize2,
  Minimize2,
  PanelLeftClose,
} from "lucide-react";
import { Loader } from "../../../components/loader/Loader";

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
  leftAction?: React.ReactNode;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onMinimize?: () => void;
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
  leftAction,
  isMaximized,
  onToggleMaximize,
  onMinimize,
}) => {
  return (
    <div className="doc-pane-top-wrapper">
      <div className="doc-pane-top">
        <div className="doc-pane-title-container">
          {leftAction && (
            <div className="doc-pane-left-action">{leftAction}</div>
          )}
          <div className="doc-pane-title-stack demo-welcome-target">
            <p className="doc-pane-title">{title}</p>
            {category ? (
              <p className="doc-pane-title small">{category}</p>
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
                  data-tooltip="Edit"
                  data-tooltip-pos="bottom"
                  aria-label="Edit"
                >
                  <SquarePenIcon size={22} width={22} />
                </button>
              ) : null}
            </>
          ) : (
            <>
              {isPending && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <Loader size={22} />
                </div>
              )}

              <button
                type="submit"
                className="primary-btn"
                disabled={!canSave || isPending}
              >
                Save
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

          {onToggleMaximize && (
            <button
              type="button"
              className="icon-btn demo-mutex-target"
              style={{
                borderRadius: "8px",
                border: "1px solid var(--border)",
                background: "var(--panel)",
                width: "32px",
                height: "32px",
                padding: "0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onClick={onToggleMaximize}
              data-tooltip={
                isMaximized ? "Restore Layout" : "Maximize Document"
              }
              data-tooltip-pos="bottom"
              title={isMaximized ? "Restore Layout" : "Maximize Document"}
            >
              {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          )}

          {onMinimize && (
            <button
              type="button"
              className="icon-btn"
              style={{
                borderRadius: "8px",
                border: "1px solid var(--border)",
                background: "var(--panel)",
                width: "32px",
                height: "32px",
                padding: "0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onClick={onMinimize}
              data-tooltip="Collapse to Rail"
              data-tooltip-pos="bottom"
              title="Collapse to Rail"
            >
              <PanelLeftClose size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
