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

import type { DocumentItem } from "../../../api/documentsClient";
import DocumentListItem from "./DocumentListItem";
import Menu from "../../../components/menu/Menu";
import { DocumentRowSkeleton } from "../../../components/skeleton/Skeleton";
import { EllipsisVertical, GripHorizontalIcon } from "lucide-react";

type Props = {
  docs: DocumentItem[];
  activeDocId: number | null;
  favorites: Record<number, boolean>;
  isAdmin: boolean;

  openMenuId: number | null;
  onToggleMenu: (id: number) => void;
  onCloseMenu: () => void;

  onOpen: (id: number) => void;
  onToggleFavorite: (id: number) => void;
  onDelete: (doc: DocumentItem) => void;

  onDragEnd: (event: DragEndEvent) => void;
  loading?: boolean;
};

function SortableRow({
  doc,
  active,
  isFavorite,
  isAdmin,
  isMenuOpen,
  onOpen,
  onToggleFavorite,
  onToggleMenu,
  onCloseMenu,
  onDelete,
}: {
  doc: DocumentItem;
  active: boolean;
  isFavorite: boolean;
  isAdmin: boolean;
  isMenuOpen: boolean;
  onOpen: () => void;
  onToggleFavorite: () => void;
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
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <DocumentListItem
        title={doc.title}
        category={doc.category}
        active={active}
        isFavorite={isFavorite}
        isDragging={isDragging}
        onClick={onOpen}
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
              <EllipsisVertical size={16} />
              {/* <GripHorizontalIcon /> */}
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
  );
}

export default function DocumentsList({
  docs,
  activeDocId,
  favorites,
  isAdmin,
  openMenuId,
  onToggleMenu,
  onCloseMenu,
  onOpen,
  onToggleFavorite,
  onDelete,
  onDragEnd,
  loading,
}: Props) {
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
              <DocumentRowSkeleton />
              <DocumentRowSkeleton />
            </>
          )}
          {docs.map((doc) => (
            <SortableRow
              key={doc.id}
              doc={doc}
              active={activeDocId === doc.id}
              isFavorite={!!favorites[doc.id]}
              isAdmin={isAdmin}
              isMenuOpen={openMenuId === doc.id}
              onOpen={() => onOpen(doc.id)}
              onToggleFavorite={() => onToggleFavorite(doc.id)}
              onToggleMenu={() => onToggleMenu(doc.id)}
              onCloseMenu={onCloseMenu}
              onDelete={() => onDelete(doc)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
