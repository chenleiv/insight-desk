import {
  Maximize2,
  Minimize2,
  PanelLeftClose,
  Trash2,
  X,
  FileUp,
  Download,
} from "lucide-react";
import { getCategoryChipStyle } from "../../utils/docs";

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
  saveStatus?: "idle" | "saving" | "saved" | "error" | undefined;
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

function SaveStatusChip({ status }: { status?: "idle" | "saving" | "saved" | "error" | undefined }) {
  if (!status || status === "idle") return null;
  const label = status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Error";
  const className = `doc-pane-save-status doc-pane-save-status--${status}`;
  return <span className={className}>{label}</span>;
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
  onImportClick,
  onExport,
}: Props) {
  const isDrawer = variant === "drawer";

  // ── Default variant: delete btn + window controls ──
  const defaultActions = (
    <>
      <SaveStatusChip status={saveStatus} />
      {onExport && !isCreating && (
        <button type="button" className="icon-btn doc-pane-header-tool-btn"
          onClick={onExport} data-tooltip="Export as Markdown" data-tooltip-pos="bottom" aria-label="Export document">
          <Download size={16} />
        </button>
      )}
      {onDelete && !isCreating && (
        <button type="button" className="icon-btn doc-pane-delete-btn"
          onClick={onDelete} data-tooltip="Delete" data-tooltip-pos="bottom" aria-label="Delete">
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
