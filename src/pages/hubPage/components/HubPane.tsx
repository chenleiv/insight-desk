import { useResize } from "../../../hooks/useResize";
import { ResizeHandle } from "../../../components/resizeHandle/ResizeHandle";

type Props = {
  editorNode: React.ReactNode;
  assistantNode: React.ReactNode;
  isAssistantOpen: boolean;
  onToggleAssistant: () => void;
  isAssistantMaximized: boolean;
  isAssistantMinimized?: boolean;
  isDocumentMaximized?: boolean;
  isDocumentMinimized?: boolean;
  isMobile: boolean;
};

export default function HubPane({
  editorNode,
  assistantNode,
  isAssistantOpen,
  onToggleAssistant,
  isAssistantMaximized,
  isAssistantMinimized,
  isDocumentMaximized,
  isDocumentMinimized,
  isMobile,
}: Props) {
  const { width: assistantWidth, startResize: startAssistantResize } =
    useResize(
      360, // initial
      340, // min
      600, // max
      true, // isReverse - dragging left increases width
    );

  return (
    <div className="hub-pane">
      <div className="hub-pane-layout">
        <div
          className={`editor-container ${isAssistantOpen && !isDocumentMaximized ? "with-assistant" : ""} ${isDocumentMaximized ? "maximized" : ""} ${isAssistantMaximized || isDocumentMinimized ? "minimized" : ""}`}
          style={isDocumentMaximized ? { flex: 1, minWidth: 0 } : undefined}
        >
          {editorNode}
        </div>

        {/* Desktop Assistant Sidebar OR Mobile Bottom Sheet */}
        {!isMobile &&
          isAssistantOpen &&
          !isAssistantMaximized &&
          !isDocumentMaximized &&
          !isAssistantMinimized && (
            <ResizeHandle onMouseDown={startAssistantResize} />
          )}
        <div
          className={`assistant-container ${isAssistantOpen ? "open" : "closed"} ${isMobile ? "mobile-sheet" : "desktop-sidebar"} ${isAssistantMaximized ? "maximized" : ""} ${isDocumentMaximized || isAssistantMinimized ? "minimized" : ""}`}
          style={
            !isMobile &&
            isAssistantOpen &&
            !isAssistantMaximized &&
            !isDocumentMaximized &&
            !isAssistantMinimized
              ? { width: assistantWidth, minWidth: assistantWidth }
              : undefined
          }
        >
          {assistantNode}
        </div>

        {/* Mobile Backdrop */}
        {isMobile && isAssistantOpen && (
          <div className="assistant-backdrop" onClick={onToggleAssistant} />
        )}
      </div>
    </div>
  );
}
