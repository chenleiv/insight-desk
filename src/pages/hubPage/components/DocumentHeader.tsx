import React from "react";
import {
  SquarePenIcon,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  Trash2,
  FileText,
  X,
  Save,
} from "lucide-react";
import { Loader } from "../../../components/loader/Loader";

type Props = {
  title: string;
  /** When set, replaces the title <p> (e.g. in-place title field while editing) */
  titleSlot?: React.ReactNode;
  category?: string | undefined;
  mode: "view" | "edit";
  isCreating: boolean;
  /** Existing document in edit mode: viewer-like header, no doc icon */
  isEditingExisting?: boolean;
  isPending: boolean;
  canEdit: boolean;
  canSave: boolean;
  isDirty?: boolean;
  variant?: "default" | "drawer";
  onEdit: () => void;
  onCancel: () => void;
  onClose?: () => void;
  onDelete?: () => void;
  leftAction?: React.ReactNode;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onMinimize?: () => void;
};

export const DocumentHeader: React.FC<Props> = ({
  title,
  titleSlot,
  category,
  mode,
  isCreating,
  isEditingExisting = false,
  isPending,
  canEdit,
  canSave,
  isDirty = false,
  variant = "default",
  onEdit,
  onCancel,
  onClose,
  onDelete,
  leftAction,
  isMaximized,
  onToggleMaximize,
  onMinimize,
}) => {
  const isDrawer = variant === "drawer";

  return (
    <div className={`doc-pane-top-wrapper ${isDrawer ? "doc-pane-top-wrapper--drawer" : ""}`}>
      <div className={`doc-pane-top ${isDrawer ? "doc-pane-top--drawer" : ""}`}>
        <div className="doc-pane-title-container">
          {leftAction && (
            <div className="doc-pane-left-action">{leftAction}</div>
          )}
          {mode === "edit" && !isEditingExisting && (
            <div className="doc-pane-header-doc-icon" aria-hidden>
              <FileText size={22} strokeWidth={1.75} />
            </div>
          )}
          <div className="doc-pane-title-stack demo-welcome-target">
            {titleSlot ? (
              <div className="doc-pane-title-slot" id="doc-drawer-title">
                <div className="doc-pane-header-title-edit-row">
                  {titleSlot}
                  {isEditingExisting && !isDrawer && (
                    <span className="doc-pane-editing-badge">Editing</span>
                  )}
                </div>
                {isEditingExisting && category ? (
                  <p className="doc-pane-title small doc-pane-category-tag">
                    {category}
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <p className="doc-pane-title" id="doc-drawer-title">
                  {title}
                </p>
                {category ? (
                  <p className="doc-pane-title small doc-pane-category-tag">
                    {category}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div
          className={`doc-pane-actions ${isDrawer && mode === "view" ? "doc-pane-actions--drawer-view" : ""} ${isDrawer && mode === "edit" ? "doc-pane-actions--drawer-edit" : ""}`}
        >
          {mode === "view" ? (
            isDrawer ? (
              <div className="doc-pane-actions-grid" role="toolbar" aria-label="Document actions">
                {canEdit && !isCreating ? (
                  <button
                    type="button"
                    className="icon-btn doc-pane-grid-btn doc-pane-edit"
                    onClick={onEdit}
                    data-tooltip="Edit"
                    data-tooltip-pos="bottom"
                    aria-label="Edit"
                  >
                    <SquarePenIcon size={16} width={16} />
                  </button>
                ) : (
                  <span className="doc-pane-grid-placeholder" aria-hidden />
                )}
                {onDelete && !isCreating ? (
                  <button
                    type="button"
                    className="icon-btn doc-pane-grid-btn danger"
                    onClick={onDelete}
                    data-tooltip="Delete"
                    data-tooltip-pos="bottom"
                    aria-label="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                ) : (
                  <span className="doc-pane-grid-placeholder" aria-hidden />
                )}
                {onToggleMaximize ? (
                  <button
                    type="button"
                    className="icon-btn doc-pane-grid-btn doc-pane-header-tool-btn demo-mutex-target"
                    onClick={onToggleMaximize}
                    data-tooltip={
                      isMaximized ? "Exit full screen" : "Full screen"
                    }
                    data-tooltip-pos="bottom"
                    title={isMaximized ? "Exit full screen" : "Full screen"}
                    aria-label={isMaximized ? "Exit full screen" : "Full screen"}
                  >
                    {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>
                ) : (
                  <span className="doc-pane-grid-placeholder" aria-hidden />
                )}
                {onClose ? (
                  <button
                    type="button"
                    className="icon-btn doc-pane-grid-btn doc-pane-close-btn"
                    onClick={onClose}
                    data-tooltip="Close"
                    data-tooltip-pos="bottom"
                    aria-label="Close document"
                  >
                    <X size={16} strokeWidth={2} />
                  </button>
                ) : (
                  <span className="doc-pane-grid-placeholder" aria-hidden />
                )}
              </div>
            ) : (
              <>
                {canEdit && !isCreating && (
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
                )}
                {onDelete && !isCreating && (
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={onDelete}
                    data-tooltip="Delete"
                    data-tooltip-pos="bottom"
                    aria-label="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                {onToggleMaximize && (
                  <button
                    type="button"
                    className="icon-btn doc-pane-header-tool-btn demo-mutex-target"
                    onClick={onToggleMaximize}
                    data-tooltip={
                      isMaximized ? "Exit full screen" : "Full screen"
                    }
                    data-tooltip-pos="bottom"
                    title={isMaximized ? "Exit full screen" : "Full screen"}
                  >
                    {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>
                )}
                {onMinimize && (
                  <button
                    type="button"
                    className="icon-btn doc-pane-header-tool-btn"
                    onClick={onMinimize}
                    data-tooltip="Collapse to Rail"
                    data-tooltip-pos="bottom"
                    title="Collapse to Rail"
                  >
                    <PanelLeftClose size={16} />
                  </button>
                )}
                {onClose && (
                  <button
                    type="button"
                    className="icon-btn doc-pane-close-btn"
                    onClick={onClose}
                    data-tooltip="Close"
                    data-tooltip-pos="bottom"
                    aria-label="Close document"
                  >
                    <X size={20} strokeWidth={2} />
                  </button>
                )}
              </>
            )
          ) : isDrawer ? (
            <div className="doc-pane-edit-drawer-toolbar">
              <div className="doc-pane-edit-drawer-row">
                {isEditingExisting && (
                  <span className="doc-pane-editing-badge">Editing</span>
                )}
                <div className="doc-pane-edit-drawer-toolbar-content">

                  {isPending && (
                    <div className="doc-pane-pending">
                      <Loader size={22} />
                    </div>
                  )}
                  <button
                    type="submit"
                    className="primary-btn doc-pane-save-btn doc-pane-save-btn--drawer"
                    disabled={!canSave || isPending}
                  >
                    <Save size={15} strokeWidth={2} aria-hidden />
                    Save
                  </button>
                  {isDirty && (
                    <span className="doc-pane-unsaved-badge" aria-live="polite">
                      Unsaved 11111
                    </span>
                  )}
                </div>
              </div>
              <div className="doc-pane-actions-grid doc-pane-actions-grid--pair" role="toolbar" aria-label="View options">
                {onToggleMaximize ? (
                  <button
                    type="button"
                    className="icon-btn doc-pane-grid-btn doc-pane-header-tool-btn demo-mutex-target"
                    onClick={onToggleMaximize}
                    data-tooltip={
                      isMaximized ? "Exit full screen" : "Full screen"
                    }
                    data-tooltip-pos="bottom"
                    title={isMaximized ? "Exit full screen" : "Full screen"}
                    aria-label={isMaximized ? "Exit full screen" : "Full screen"}
                  >
                    {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>
                ) : (
                  <span className="doc-pane-grid-placeholder" aria-hidden />
                )}
                {onClose ? (
                  <button
                    type="button"
                    className="icon-btn doc-pane-grid-btn doc-pane-close-btn"
                    onClick={onClose}
                    data-tooltip="Close"
                    data-tooltip-pos="bottom"
                    aria-label="Close document"
                  >
                    <X size={16} strokeWidth={2} />
                  </button>
                ) : (
                  <span className="doc-pane-grid-placeholder" aria-hidden />
                )}
              </div>
            </div>
          ) : (
            <>
              {isDirty && (
                <span className="doc-pane-unsaved-badge" aria-live="polite">
                  Unsaved
                </span>
              )}
              {isPending && (
                <div className="doc-pane-pending">
                  <Loader size={22} />
                </div>
              )}

              <button
                type="submit"
                className="primary-btn doc-pane-save-btn"
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
              {onToggleMaximize && (
                <button
                  type="button"
                  className="icon-btn doc-pane-header-tool-btn demo-mutex-target"
                  onClick={onToggleMaximize}
                  data-tooltip={
                    isMaximized ? "Exit full screen" : "Full screen"
                  }
                  data-tooltip-pos="bottom"
                  title={isMaximized ? "Exit full screen" : "Full screen"}
                >
                  {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
              )}
              {onMinimize && (
                <button
                  type="button"
                  className="icon-btn doc-pane-header-tool-btn"
                  onClick={onMinimize}
                  data-tooltip="Collapse to Rail"
                  data-tooltip-pos="bottom"
                  title="Collapse to Rail"
                >
                  <PanelLeftClose size={16} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
