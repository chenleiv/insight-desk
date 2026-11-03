import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  MoreVertical,
  PanelLeftClose,
  Trash2,
  X,
  FileUp,
  Download,
  Pencil,
} from "lucide-react";
import { useRef, useState } from "react";
import Menu from "../../../../components/menu/Menu";
import { useMobile } from "../../../../hooks/useMobile";
import { getCategoryChipStyle } from "../../utils/docs";
import type { SaveStatus } from "../../hooks/useDocumentSave";
import type { DownloadFormat } from "../../../../api/documentsClient";
import { UPLOAD_ACCEPT } from "../../../../../shared/uploadRules";

const IMPORT_TOOLTIP = `Supported: .json ${UPLOAD_ACCEPT.split(",").join(" ")}`;

// "unsaved": edits not saved yet. "deleting": the delete request is running.
type HeaderSaveStatus = SaveStatus | "unsaved" | "deleting";

// Gives the header actions one resting look; only hover, focus and disabled differ.
const HEADER_BTN = "doc-pane-header-btn";

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
  isDeleting?: boolean;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onMinimize?: () => void;
  saveStatus?: HeaderSaveStatus | undefined;
  onEdit?: () => void;
  editActions?: EditActions;
  onImportClick?: () => void;
  importDisabled?: boolean;
  onDownload?: (format: DownloadFormat) => void;
};

function MaximizeBtn({ isMaximized, className = "", onClick }: { isMaximized: boolean | undefined; className?: string; onClick: () => void }) {
  const label = isMaximized ? "Exit full screen" : "Full screen";
  return (
    <button type="button"
      className={`icon-btn ${HEADER_BTN} doc-pane-header-tool-btn demo-mutex-target ${className}`}
      onClick={onClick} data-tooltip={label} data-tooltip-pos="bottom"
      title={label} aria-label={label}>
      {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
    </button>
  );
}

function CloseBtn({ size = 16, className = "", onClick }: { size?: number; className?: string; onClick: () => void }) {
  return (
    <button type="button" className={`icon-btn ${HEADER_BTN} doc-pane-close-btn ${className}`}
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
  deleting: "Deleting…",
};

// Always rendered, so screen readers announce each change of the live region.
function SaveStatusChip({ status }: { status?: HeaderSaveStatus | undefined }) {
  if (!status) return null;
  const className = `doc-pane-save-status doc-pane-save-status--${status}`;
  return <span className={className} role="status" aria-live="polite">{SAVE_STATUS_LABELS[status]}</span>;
}

function EditBtn({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" className={`doc-pane-mode-btn ${HEADER_BTN} doc-pane-edit-btn`} onClick={onClick}
      disabled={disabled} title="Edit document">
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

const DOWNLOAD_OPTIONS: { format: DownloadFormat; label: string }[] = [
  { format: "md", label: "Markdown (.md)" },
  { format: "pdf", label: "PDF (.pdf)" },
  { format: "docx", label: "Word (.docx)" },
];

function DownloadBtn({ onDownload, disabledHint }: { onDownload: (format: DownloadFormat) => void; disabledHint?: string | undefined }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button type="button" ref={btnRef} className={`icon-btn ${HEADER_BTN} doc-pane-header-tool-btn`}
        onClick={() => setOpen(true)} disabled={!!disabledHint}
        aria-haspopup="menu" aria-expanded={open}
        data-tooltip={disabledHint ?? "Export as Markdown, PDF or Word"} data-tooltip-pos="bottom" aria-label="Export document">
        <Download size={16} />
      </button>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        items={DOWNLOAD_OPTIONS.map(({ format, label }) => ({ label, onClick: () => onDownload(format) }))}
      />
    </>
  );
}

function MinimizeBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={`icon-btn ${HEADER_BTN} doc-pane-header-tool-btn`}
      onClick={onClick} data-tooltip="Collapse to Rail" data-tooltip-pos="bottom" title="Collapse to Rail">
      <PanelLeftClose size={16} />
    </button>
  );
}

function BackBtn({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" className="icon-btn doc-pane-back" onClick={onClick} disabled={disabled} aria-label="Back">
      <ArrowLeft size={18} aria-hidden />
    </button>
  );
}

// Wide enough for the longest label on one line.
const MORE_MENU_WIDTH = 220;

function MoreMenu({ onDownload, onDelete, isDeleting }: {
  onDownload?: ((format: DownloadFormat) => void) | undefined;
  onDelete?: (() => void) | undefined;
  isDeleting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  // The menu closes itself on pointer down, so without this a second tap would reopen it.
  const closingRef = useRef(false);

  const items = [
    ...(onDownload ? DOWNLOAD_OPTIONS.map(({ format, label }) => ({
      label: `Export as ${label}`,
      onClick: () => onDownload(format),
    })) : []),
    // Not returned to the menu, which would stay open behind the confirm dialog until it is answered.
    ...(onDelete ? [{ label: "Delete", danger: true, disabled: isDeleting, onClick: () => { onDelete(); } }] : []),
  ];
  if (items.length === 0) return null;

  return (
    <>
      <button type="button" ref={btnRef} className={`icon-btn ${HEADER_BTN} doc-pane-header-tool-btn`}
        onPointerDown={() => { closingRef.current = open; }}
        onClick={() => {
          if (!closingRef.current) setOpen(true);
          closingRef.current = false;
        }}
        aria-haspopup="menu" aria-expanded={open} aria-label="More actions">
        <MoreVertical size={16} aria-hidden />
      </button>
      <Menu open={open} onClose={() => setOpen(false)} anchorRef={btnRef} minWidth={MORE_MENU_WIDTH} items={items} />
    </>
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
  isDeleting = false,
  isMaximized,
  onToggleMaximize,
  onMinimize,
  saveStatus,
  onEdit,
  editActions,
  onImportClick,
  importDisabled = false,
  onDownload,
}: Props) {
  const isDrawer = variant === "drawer";
  const isPhone = useMobile() && !isDrawer;
  // Download would leave out unsaved text and delete would drop the edit, so both wait for Save or Cancel.
  const isEditing = !!editActions;
  const editingHint = "Save or cancel your changes first";

  // ── Default variant: delete btn + window controls ──
  const defaultActions = (
    <>
      <SaveStatusChip status={isDeleting ? "deleting" : saveStatus} />
      {editActions && !isCreating && <SaveCancelBtns {...editActions} />}
      {onEdit && !isCreating && <EditBtn onClick={onEdit} disabled={isDeleting} />}
      {onDownload && !isCreating && (
        <DownloadBtn onDownload={onDownload} disabledHint={isEditing ? editingHint : undefined} />
      )}
      {onDelete && !isCreating && (
        <button type="button" className={`icon-btn ${HEADER_BTN} doc-pane-delete-btn`}
          onClick={onDelete} disabled={isEditing || isDeleting} aria-busy={isDeleting}
          data-tooltip={isEditing ? editingHint : "Delete"} data-tooltip-pos="bottom" aria-label="Delete">
          <Trash2 size={16} />
        </button>
      )}
      {onToggleMaximize && <MaximizeBtn isMaximized={isMaximized} onClick={onToggleMaximize} />}
      {onMinimize && <MinimizeBtn onClick={onMinimize} />}
      {onClose && <CloseBtn size={16} onClick={onClose} />}
    </>
  );

  // ── Phones: the buttons above need more than the width, so Back moves to the left and
  // Export and Delete into a menu. Like them, the menu waits for Save or Cancel.
  const phoneActions = (
    <>
      <SaveStatusChip status={isDeleting ? "deleting" : saveStatus} />
      {editActions && !isCreating && <SaveCancelBtns {...editActions} />}
      {onEdit && !isCreating && <EditBtn onClick={onEdit} disabled={isDeleting} />}
      {!isEditing && !isCreating && <MoreMenu onDownload={onDownload} onDelete={onDelete} isDeleting={isDeleting} />}
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
        {/* Not while a request runs: the document may be created, saved or gone when it ends. */}
        {isPhone && onClose && (
          <BackBtn onClick={onClose} disabled={isDeleting || importDisabled || !!editActions?.isSaving} />
        )}
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
              disabled={importDisabled}
              data-tooltip={IMPORT_TOOLTIP}
              data-tooltip-pos="bottom"
            >
              <FileUp size={13} aria-hidden />
              Import text from file
            </button>
          )}
        </div>

        <div className={`doc-pane-actions${isDrawer ? " doc-pane-actions--drawer-edit" : ""}`}>
          {isDrawer ? editActionsDrawer : isPhone ? phoneActions : defaultActions}
        </div>
      </div>
    </div>
  );
}
