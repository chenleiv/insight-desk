import {
  Maximize2,
  Minimize2,
  PanelLeftClose,
  Trash2,
  X,
  FileUp,
  Download,
  Pencil,
} from "lucide-react";
import { getCategoryChipStyle } from "../../utils/docs";
import type { SaveStatus } from "../../hooks/useDocumentSave";

// "unsaved": edits not saved yet.
type HeaderSaveStatus = SaveStatus | "unsaved";

// Shown in place of the Edit button while editing.
type EditActions = {
  onSave: () => void;
  onCancel: () => void;
  canSave: boolean;
  isSaving: boolean;
};

type Props = {
  title: string;
  category?: string | undefined;
  isCreating: boolean;
  variant?: "default" | "drawer";
  onCancel: () => void;
  onClose?: () => void;
  onDelete?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onMinimize?: () => void;
  saveStatus?: HeaderSaveStatus | undefined;
  onEdit?: () => void;
  editActions?: EditActions;
  onImportClick?: () => void;
  onExport?: () => void;
};

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

const SAVE_STATUS_LABELS: Record<HeaderSaveStatus, string> = {
  idle: "",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
};

// Always rendered, so screen readers announce each change of the live region.
function SaveStatusChip({ status }: { status?: HeaderSaveStatus | undefined }) {
  if (!status) return null;
  const className = `doc-pane-save-status doc-pane-save-status--${status}`;
  return <span className={className} role="status" aria-live="polite">{SAVE_STATUS_LABELS[status]}</span>;
}

function EditBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="doc-pane-mode-btn doc-pane-edit-btn" onClick={onClick} title="Edit document">
      <Pencil size={14} aria-hidden />
      Edit
    </button>
  );
}

function SaveCancelBtns({ onSave, onCancel, canSave, isSaving }: EditActions) {
  return (
    <>
      <button type="button" className="doc-pane-mode-btn doc-pane-cancel-edit-btn" onClick={onCancel} disabled={isSaving}>
        Cancel
      </button>
      <button type="button" className="doc-pane-mode-btn doc-pane-mode-btn--primary doc-pane-save-edit-btn"
        onClick={onSave} disabled={!canSave || isSaving}>
        Save
      </button>
    </>
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


const Placeholder = () => <span className="doc-pane-grid-placeholder" aria-hidden />;

export function DocumentHeader({
  title,
  category,
  isCreating,
  variant = "default",
  onCancel,
  onClose,
  onDelete,
  isMaximized,
  onToggleMaximize,
  onMinimize,
  saveStatus,
  onEdit,
  editActions,
  onImportClick,
  onExport,
}: Props) {
  const isDrawer = variant === "drawer";
  // Export would take unsaved text and delete would drop the edit, so both wait for Save or Cancel.
  const isEditing = !!editActions;
  const editingHint = "Save or cancel your changes first";

  // ── Default variant: delete btn + window controls ──
  const defaultActions = (
    <>
      <SaveStatusChip status={saveStatus} />
      {editActions && !isCreating && <SaveCancelBtns {...editActions} />}
      {onEdit && !isCreating && <EditBtn onClick={onEdit} />}
      {onExport && !isCreating && (
        <button type="button" className="icon-btn doc-pane-header-tool-btn"
          onClick={onExport} disabled={isEditing}
          data-tooltip={isEditing ? editingHint : "Export as Markdown"} data-tooltip-pos="bottom" aria-label="Export document">
          <Download size={16} />
        </button>
      )}
      {onDelete && !isCreating && (
        <button type="button" className="icon-btn doc-pane-delete-btn"
          onClick={onDelete} disabled={isEditing}
          data-tooltip={isEditing ? editingHint : "Delete"} data-tooltip-pos="bottom" aria-label="Delete">
          <Trash2 size={16} />
        </button>
      )}
      {onToggleMaximize && <MaximizeBtn isMaximized={isMaximized} onClick={onToggleMaximize} />}
      {onMinimize && <MinimizeBtn onClick={onMinimize} />}
      {onClose && <CloseBtn size={16} onClick={onClose} />}
    </>
  );

  // ── Drawer variant: keeps grid layout ──
  const editActionsDrawer = (
    <div className="doc-pane-actions-grid" role="toolbar" aria-label="Document actions">
      {onToggleMaximize ? <MaximizeBtn className="doc-pane-grid-btn" isMaximized={isMaximized} onClick={onToggleMaximize} /> : <Placeholder />}
      <CloseBtn className="doc-pane-grid-btn" onClick={onCancel} />
    </div>
  );

  return (
    <div className={`doc-pane-top-wrapper ${isDrawer ? "doc-pane-top-wrapper--drawer" : ""}`}>
      <div className={`doc-pane-top ${isDrawer ? "doc-pane-top--drawer" : ""}`}>
        <div className="doc-pane-title-container">
          <div className="doc-pane-title-stack demo-welcome-target">
            {isDrawer && (
              <>
                {title && <p className="doc-pane-title" id="doc-drawer-title" title={title}>{title}</p>}
                {category && (
                  <p className="doc-pane-title small doc-pane-category-tag" style={getCategoryChipStyle(category)}>{category}</p>
                )}
              </>
            )}
          </div>
          {onImportClick && (
            <button
              type="button"
              className="doc-pane-import-btn"
              onClick={onImportClick}
              data-tooltip="Supported: .txt .md .json .rtf .csv"
              data-tooltip-pos="bottom"
            >
              <FileUp size={13} aria-hidden />
              Import text from file
            </button>
          )}
        </div>

        <div className={`doc-pane-actions${isDrawer ? " doc-pane-actions--drawer-edit" : ""}`}>
          {!isDrawer ? defaultActions : editActionsDrawer}
        </div>
      </div>
    </div>
  );
}
