import React from "react";
import {
  SquarePenIcon,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  Trash2,
  X,
  Save,
} from "lucide-react";
import { Loader } from "../../../components/loader/Loader";

type Props = {
  title: string;
  titleSlot?: React.ReactNode;
  category?: string | undefined;
  mode: "view" | "edit";
  isCreating: boolean;
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
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onMinimize?: () => void;
};

// --- Shared button components ---

function EditBtn({ size = 16, className = "", onClick }: { size?: number; className?: string; onClick: () => void }) {
  return (
    <button type="button" className={`icon-btn doc-pane-edit ${className}`}
      onClick={onClick} data-tooltip="Edit" data-tooltip-pos="bottom" aria-label="Edit">
      <SquarePenIcon size={size} width={size} />
    </button>
  );
}

function DeleteBtn({ className = "", onClick }: { className?: string; onClick: () => void }) {
  return (
    <button type="button" className={`icon-btn danger ${className}`}
      onClick={onClick} data-tooltip="Delete" data-tooltip-pos="bottom" aria-label="Delete">
      <Trash2 size={16} />
    </button>
  );
}

function MaximizeBtn({ isMaximized, className = "", onClick }: { isMaximized: boolean | undefined; className?: string; onClick: () => void }) {
  const label = isMaximized ? "Exit full screen" : "Full screen";
  return (
    <button type="button"
      className={`icon-btn doc-pane-header-tool-btn demo-mutex-target ${className}`}
      onClick={onClick} data-tooltip={label} data-tooltip-pos="bottom"
      title={label} aria-label={label}>
      {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
    </button>
  );
}

function CloseBtn({ size = 16, className = "", onClick }: { size?: number; className?: string; onClick: () => void }) {
  return (
    <button type="button" className={`icon-btn doc-pane-close-btn ${className}`}
      onClick={onClick} data-tooltip="Close" data-tooltip-pos="bottom" aria-label="Close document">
      <X size={size} strokeWidth={2} />
    </button>
  );
}

function MinimizeBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="icon-btn doc-pane-header-tool-btn"
      onClick={onClick} data-tooltip="Collapse to Rail" data-tooltip-pos="bottom" title="Collapse to Rail">
      <PanelLeftClose size={16} />
    </button>
  );
}

function SaveBtn({ isPending, canSave, isDrawer }: { isPending: boolean; canSave: boolean; isDrawer: boolean }) {
  return (
    <button type="submit"
      className={`primary-btn doc-pane-save-btn${isDrawer ? " doc-pane-save-btn--drawer" : ""}`}
      disabled={!canSave || isPending}>
      {isDrawer && <Save size={15} strokeWidth={2} aria-hidden />}
      Save
    </button>
  );
}

const Placeholder = () => <span className="doc-pane-grid-placeholder" aria-hidden />;

// --- Main component ---

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
  isDirty: _isDirty = false,
  variant = "default",
  onEdit,
  onCancel,
  onClose,
  onDelete,
  isMaximized,
  onToggleMaximize,
  onMinimize,
}) => {
  const isDrawer = variant === "drawer";

  const viewActionsDrawer = (
    <div className="doc-pane-actions-grid" role="toolbar" aria-label="Document actions">
      {canEdit && !isCreating ? <EditBtn className="doc-pane-grid-btn" onClick={onEdit} /> : <Placeholder />}
      {onDelete && !isCreating ? <DeleteBtn className="doc-pane-grid-btn" onClick={onDelete} /> : <Placeholder />}
      {onToggleMaximize ? <MaximizeBtn className="doc-pane-grid-btn" isMaximized={isMaximized} onClick={onToggleMaximize} /> : <Placeholder />}
      {onClose ? <CloseBtn className="doc-pane-grid-btn" onClick={onClose} /> : <Placeholder />}
    </div>
  );

  const viewActionsDefault = (
    <>
      {canEdit && !isCreating && <EditBtn size={22} onClick={onEdit} />}
      {onDelete && !isCreating && <DeleteBtn onClick={onDelete} />}
      {onToggleMaximize && <MaximizeBtn isMaximized={isMaximized} onClick={onToggleMaximize} />}
      {onMinimize && <MinimizeBtn onClick={onMinimize} />}
      {onClose && <CloseBtn size={20} onClick={onClose} />}
    </>
  );

  const editActionsDrawer = (
    <div className="doc-pane-actions-grid" role="toolbar" aria-label="Document actions">
      {onToggleMaximize ? <MaximizeBtn className="doc-pane-grid-btn" isMaximized={isMaximized} onClick={onToggleMaximize} /> : <Placeholder />}
      <CloseBtn className="doc-pane-grid-btn" onClick={onCancel} />
    </div>
  );

  const editActionsDefault = (
    <>
      {isPending && <div className="doc-pane-pending"><Loader size={22} /></div>}
      <SaveBtn isPending={isPending} canSave={canSave} isDrawer={false} />
      <button type="button" className="primary-btn" onClick={onCancel} disabled={isPending}>
        Cancel
      </button>
      {onToggleMaximize && <MaximizeBtn isMaximized={isMaximized} onClick={onToggleMaximize} />}
      {onMinimize && <MinimizeBtn onClick={onMinimize} />}
    </>
  );

  return (
    <div className={`doc-pane-top-wrapper ${isDrawer ? "doc-pane-top-wrapper--drawer" : ""}`}>
      <div className={`doc-pane-top ${isDrawer ? "doc-pane-top--drawer" : ""}`}>
        <div className="doc-pane-title-container">
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
                  <p className="doc-pane-title small doc-pane-category-tag">{category}</p>
                ) : null}
              </div>
            ) : (
              <>
                {title && <p className="doc-pane-title" id="doc-drawer-title">{title}</p>}
                {category && (
                  <p className="doc-pane-title small doc-pane-category-tag">{category}</p>
                )}
              </>
            )}
          </div>
        </div>

        <div className={`doc-pane-actions ${isDrawer && mode === "view" ? "doc-pane-actions--drawer-view" : ""} ${isDrawer && mode === "edit" ? "doc-pane-actions--drawer-edit" : ""}`}>
          {mode === "view"
            ? isDrawer ? viewActionsDrawer : viewActionsDefault
            : isDrawer ? editActionsDrawer : editActionsDefault}
        </div>
      </div>
    </div>
  );
};
