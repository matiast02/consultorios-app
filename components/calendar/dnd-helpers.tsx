"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { Shift } from "@/types";

// ─── DroppableSlot ────────────────────────────────────────────────────────────

export function DroppableSlot({
  id,
  children,
  className,
  onClick,
}: {
  id: string;
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={`${className} ${isOver ? "!bg-primary/20 ring-1 ring-primary/40" : ""}`}
    >
      {children}
    </div>
  );
}

// ─── DraggableShift ───────────────────────────────────────────────────────────

export function DraggableShift({
  shift,
  children,
  className,
  style,
  onClick,
}: {
  shift: Shift;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const isDraggable = shift.status === "PENDING" || shift.status === "CONFIRMED";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: shift.id,
    disabled: !isDraggable,
  });

  const dragStyle: React.CSSProperties = {
    ...style,
    ...(transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : {}),
    opacity: isDragging ? 0.4 : 1,
    cursor: isDraggable ? "grab" : "pointer",
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      {...(isDraggable ? { ...listeners, ...attributes } : {})}
      className={className}
      style={dragStyle}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
