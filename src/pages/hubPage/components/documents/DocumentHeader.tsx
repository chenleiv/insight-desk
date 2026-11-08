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
import type { SaveStatus } from "../../hooks/useDocumentSave";
import type { DownloadFormat } from "../../../../api/documentsClient";
import { UPLOAD_ACCEPT } from "../../../../../shared/uploadRules";

const IMPORT_TOOLTIP = `Supported: .json ${UPLOAD_ACCEPT.split(",").join(" ")}`;

// "unsaved": edits not saved yet. "deleting" and "downloading": that request is running.
type HeaderSaveStatus = SaveStatus | "unsaved" | "deleting" | "downloading";

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
  isCreating: boolean;
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
  isImportingText?: boolean;
  onDownload?: (format: DownloadFormat) => void;
  isDownloading?: boolean;
};

function MaximizeBtn({ isMaximized, onClick }: { isMaximized: boolean | undefined; onClick: () => void }) {
  const label = isMaximized ? "Exit full screen" : "Full screen";
  return (
    <button type="button"
      className={`icon-btn ${HEADER_BTN} doc-pane-header-tool-btn demo-mutex-target`}
      onClick={onClick} data-tooltip={label} data-tooltip-pos="bottom"
      title={label} aria-label={label}>
      {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
    </button>
  );
}

function CloseBtn({ size = 16, onClick }: { size?: number; onClick: () => void }) {
  return (
    <button type="button" className={`icon-btn ${HEADER_BTN} doc-pane-close-btn`}
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
  downloading: "Downloading…",
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

function DownloadBtn({ onDownload, disabledHint, isDownloading }: {
  onDownload: (format: DownloadFormat) => void;
  disabledHint?: string | undefined;
  isDownloading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button type="button" ref={btnRef} className={`icon-btn ${HEADER_BTN} doc-pane-header-tool-btn`}
        onClick={() => setOpen(true)} disabled={!!disabledHint || isDownloading} aria-busy={isDownloading}
        aria-haspopup="menu" aria-expanded={open}
        data-tooltip={disabledHint ?? (isDownloading ? "Downloading…" : "Export as Markdown, PDF or Word")} data-tooltip-pos="bottom" aria-label="Export document">
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

function MoreMenu({ onDownload, onDelete, isDeleting, isDownloading }: {
  onDownload?: ((format: DownloadFormat) => void) | undefined;
  onDelete?: (() => void) | undefined;
  isDeleting: boolean;
  isDownloading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  // The menu closes itself on pointer down, so without this a second tap would reopen it.
  const closingRef = useRef(false);

  const items = [
    ...(onDownload ? DOWNLOAD_OPTIONS.map(({ format, label }) => ({
      label: `Export as ${label}`,
      disabled: isDownloading,
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

export function DocumentHeader({
  isCreating,
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
  isImportingText = false,
  onDownload,
  isDownloading = false,
}: Props) {
  const isPhone = useMobile();
  const chipStatus = isDeleting ? "deleting" : isDownloading ? "downloading" : saveStatus;
  // Download would leave out unsaved text and delete would drop the edit, so both wait for Save or Cancel.
  const isEditing = !!editActions;
  const editingHint = "Save or cancel your changes first";

  // ── Delete btn + window controls ──
  const defaultActions = (
    <>
      <SaveStatusChip status={chipStatus} />
      {editActions && !isCreating && <SaveCancelBtns {...editActions} />}
      {onEdit && !isCreating && <EditBtn onClick={onEdit} disabled={isDeleting} />}
      {onDownload && !isCreating && (
        <DownloadBtn onDownload={onDownload} disabledHint={isEditing ? editingHint : undefined} isDownloading={isDownloading} />
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
      <SaveStatusChip status={chipStatus} />
      {editActions && !isCreating && <SaveCancelBtns {...editActions} />}
      {onEdit && !isCreating && <EditBtn onClick={onEdit} disabled={isDeleting} />}
      {!isEditing && !isCreating && <MoreMenu onDownload={onDownload} onDelete={onDelete} isDeleting={isDeleting} isDownloading={isDownloading} />}
    </>
  );

  return (
    <div className="doc-pane-top-wrapper">
      <div className="doc-pane-top">
        {/* Not while a request runs: the document may be created, saved or gone when it ends. */}
        {isPhone && onClose && (
          <BackBtn onClick={onClose} disabled={isDeleting || importDisabled || !!editActions?.isSaving} />
        )}
        <div className="doc-pane-title-container">
          {onImportClick && (
            <button
              type="button"
              className="doc-pane-import-btn"
              onClick={onImportClick}
              disabled={importDisabled}
              aria-busy={isImportingText}
              data-tooltip={IMPORT_TOOLTIP}
              data-tooltip-pos="bottom"
            >
              <FileUp size={13} aria-hidden />
              {isImportingText ? "Importing text…" : "Import text from file"}
            </button>
          )}
        </div>

        <div className="doc-pane-actions">
          {isPhone ? phoneActions : defaultActions}
        </div>
      </div>
    </div>
  );
}
