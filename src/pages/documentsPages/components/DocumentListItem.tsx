import React from "react";
import { Star } from "lucide-react";

type Props = {
  title: string;
  category?: string;
  active: boolean;
  isFavorite?: boolean;
  isDragging?: boolean;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  actions: React.ReactNode;
};

export default function DocumentListItem({
  title,
  category,
  active,
  isFavorite,
  isDragging,
  onClick,
  onKeyDown,
  actions,
}: Props) {
  return (
    <div
      className={[
        "doc-row",
        active ? "is-active" : "",
        isDragging ? "is-dragging" : "",
      ].join(" ")}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <div className="doc-row-main">
        <div className="doc-row-title-row">
          {isFavorite ? (
            <div className="doc-row-favorite" title="Favorite">
              <Star size={14} fill="currentColor" />
            </div>
          ) : (
            <div className="doc-row-favorite"></div>
          )}
          <div className="doc-row-title">{title}</div>
          <div className="doc-row-meta">{category}</div>
        </div>
      </div>

      <div className="doc-row-actions" onClick={(e) => e.stopPropagation()}>
        {actions}
      </div>
    </div>
  );
}
