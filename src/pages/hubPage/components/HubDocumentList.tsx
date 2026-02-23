import React, { useRef } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EllipsisVertical, Square, CheckSquare } from "lucide-react";

import type { DocumentItem } from "../../../api/documentsClient";
import DocumentListItem from "./DocumentListItem";
import Menu from "../../../components/menu/Menu";
import { DocumentRowSkeleton } from "../../../components/skeleton/Skeleton";
import { Popover } from "../../../components/popover/Popover";
import { useOnboarding } from "../../../hooks/useOnboarding";

type Props = {
  docs: DocumentItem[];
  activeDocId: number | null;
  selectedIds: number[];
  favorites: Record<number, boolean>;
  isAdmin: boolean;
  openMenuId: number | null;
  onToggleMenu: (id: number) => void;
  onCloseMenu: () => void;
  onOpen: (id: number) => void;
  onToggleFavorite: (id: number) => void;
  onToggleSelected: (id: number) => void;
  onDelete: (doc: DocumentItem) => void;
  onDragEnd: (event: DragEndEvent) => void;
  loading?: boolean;
};

function HubSortableRow({
  doc,
  active,
  isSelected,
  isFavorite,
  isAdmin,
  isMenuOpen,
  onOpen,
  onToggleFavorite,
  onToggleSelected,
  onToggleMenu,
  onCloseMenu,
  onDelete,
}: {
  doc: DocumentItem;
  active: boolean;
  isSelected: boolean;
  isFavorite: boolean;
  isAdmin: boolean;
  isMenuOpen: boolean;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onToggleSelected: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onDelete: () => void;
}) {
  const {
    setNodeRef,
    transform,
    transition,
    isDragging,
    attributes,
    listeners,
  } = useSortable({ id: doc.id });

  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.75 : 1,
  };

  const menuItems = [
    {
      label: isFavorite ? "Remove favorite" : "Add favorite",
      onClick: onToggleFavorite,
    },
    ...(isAdmin
      ? [
          {
            label: "Delete",
            danger: true,
            onClick: onDelete,
          },
        ]
      : []),
  ];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`hub-doc-row-wrapper ${active ? "is-active" : ""}`}
      onClick={onOpen}
    >
      <div
        className="selection-area demo-context-target"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelected();
        }}
      >
        {isSelected ? (
          <CheckSquare size={16} className="selected-icon" />
        ) : (
          <Square size={16} className="unselected-icon" />
        )}
      </div>

      <div className="list-item-area" {...attributes} {...listeners}>
        <DocumentListItem
          title={doc.title}
          category={doc.category}
          active={active}
          isFavorite={isFavorite}
          isDragging={isDragging}
          onClick={() => {}} // Internal click is handled by wrapper
          onKeyDown={(e) => {
            if (e.key === "Enter") onOpen();
          }}
          actions={
            <div className="menu-wrap">
              <button
                ref={menuBtnRef}
                className="icon-btn"
                type="button"
                aria-label="Menu"
                title="Menu"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMenu();
                }}
              >
                <EllipsisVertical size={20} />
              </button>
              <Menu
                open={isMenuOpen}
                onClose={onCloseMenu}
                items={menuItems}
                anchorRef={menuBtnRef}
              />
            </div>
          }
        />
      </div>
    </div>
  );
}

export default function HubDocumentList({
  docs,
  activeDocId,
  selectedIds,
  favorites,
  isAdmin,
  openMenuId,
  onToggleMenu,
  onCloseMenu,
  onOpen,
  onToggleFavorite,
  onToggleSelected,
  onDelete,
  onDragEnd,
  loading,
}: Props) {
  const { hasClickedFab, hasSelectedContext, completeCtx } = useOnboarding();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const ids = docs.map((d) => d.id);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="docs-list">
          {loading && docs.length === 0 && (
            <>
              <DocumentRowSkeleton />
              <DocumentRowSkeleton />
              <DocumentRowSkeleton />
            </>
          )}
          {docs.map((doc) => (
            <HubSortableRow
              key={doc.id}
              doc={doc}
              active={activeDocId === doc.id}
              isSelected={selectedIds.includes(doc.id)}
              isFavorite={!!favorites[doc.id]}
              isAdmin={isAdmin}
              isMenuOpen={openMenuId === doc.id}
              onOpen={() => onOpen(doc.id)}
              onToggleFavorite={() => onToggleFavorite(doc.id)}
              onToggleSelected={() => onToggleSelected(doc.id)}
              onToggleMenu={() => onToggleMenu(doc.id)}
              onCloseMenu={onCloseMenu}
              onDelete={() => onDelete(doc)}
            />
          ))}
        </div>
      </SortableContext>
      {/* Step 2 Onboarding: Points to the first checkbox if available */}
      {docs.length > 0 && hasClickedFab && !hasSelectedContext && (
        <Popover
          isOpen={true}
          onClose={completeCtx}
          title="Provide Context"
          body="Select documents using these checkboxes so the AI knows what to read."
          position="right"
          targetSelector=".docs-list .hub-doc-row-wrapper:first-child .selection-area svg"
        />
      )}
    </DndContext>
  );
}
