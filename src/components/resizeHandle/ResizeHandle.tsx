import React from "react";

export function ResizeHandle({
  onMouseDown,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="resize-handle"
      onMouseDown={onMouseDown}
      style={{
        width: "8px",
        flexShrink: 0,
        cursor: "col-resize",
        background: "transparent",
        position: "relative",
        zIndex: 50,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: "3px",
          width: "2px",
          background: "var(--border)",
          transition: "background 0.2s ease, width 0.2s ease",
        }}
        className="resize-handle-inner"
      />
    </div>
  );
}
