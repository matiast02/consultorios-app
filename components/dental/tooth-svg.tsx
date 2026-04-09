"use client";

import { memo } from "react";
import type { ToothData, Face, FaceStatus } from "./odontogram-types";
import { FACE_STATUS_COLORS, TOOTH_STATUS_COLORS } from "./odontogram-types";

interface ToothSVGProps {
  toothNumber: string;
  data: ToothData;
  size?: number;
  activeTool: FaceStatus | "missing" | "implant";
  onFaceClick: (tooth: string, face: Face) => void;
  onToothStatusChange: (tooth: string) => void;
  isUpper: boolean;
}

// Tooth shape: 5 faces arranged as a cross/diamond
// Center = Oclusal/Incisal (O)
// Top = Vestibular (V) for upper / Lingual for lower, but we keep V label
// Bottom = Palatino/Lingual (P)
// Left = Mesial (M)
// Right = Distal (D)

function ToothSVGComponent({
  toothNumber,
  data,
  size = 40,
  activeTool,
  onFaceClick,
  onToothStatusChange,
  isUpper,
}: ToothSVGProps) {
  const s = size;
  const half = s / 2;
  const inner = s * 0.28; // inner square size
  const cx = half;
  const cy = half;

  function getFaceColor(face: Face): string {
    if (data.status === "missing") return TOOTH_STATUS_COLORS.missing;
    const status = data.faces[face] ?? "healthy";
    return FACE_STATUS_COLORS[status];
  }

  function getStroke(face: Face): string {
    if (data.status === "missing") return "#4B5563";
    const status = data.faces[face] ?? "healthy";
    return status === "healthy" ? "#6B7280" : FACE_STATUS_COLORS[status];
  }

  // Polygons for each face (trapezoids around center square)
  const faces: { face: Face; points: string }[] = [
    // Top (Vestibular for upper, shown at top)
    {
      face: isUpper ? "V" : "P",
      points: `0,0 ${s},0 ${cx + inner},${cy - inner} ${cx - inner},${cy - inner}`,
    },
    // Bottom (Palatino for upper, shown at bottom)
    {
      face: isUpper ? "P" : "V",
      points: `${cx - inner},${cy + inner} ${cx + inner},${cy + inner} ${s},${s} 0,${s}`,
    },
    // Left (Mesial)
    {
      face: "M",
      points: `0,0 ${cx - inner},${cy - inner} ${cx - inner},${cy + inner} 0,${s}`,
    },
    // Right (Distal)
    {
      face: "D",
      points: `${cx + inner},${cy - inner} ${s},0 ${s},${s} ${cx + inner},${cy + inner}`,
    },
    // Center (Oclusal/Incisal)
    {
      face: "O",
      points: `${cx - inner},${cy - inner} ${cx + inner},${cy - inner} ${cx + inner},${cy + inner} ${cx - inner},${cy + inner}`,
    },
  ];

  const isMissing = data.status === "missing";
  const isImplant = data.status === "implant";

  return (
    <g className="tooth-group">
      {/* Tooth faces */}
      {faces.map(({ face, points }) => (
        <polygon
          key={face}
          points={points}
          fill={getFaceColor(face)}
          stroke={getStroke(face)}
          strokeWidth={0.8}
          className={
            isMissing
              ? "opacity-40"
              : "cursor-pointer transition-opacity hover:opacity-80"
          }
          onClick={(e) => {
            e.stopPropagation();
            if (!isMissing) onFaceClick(toothNumber, face);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onToothStatusChange(toothNumber);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToothStatusChange(toothNumber);
          }}
        >
          <title>
            {toothNumber} - {face}
          </title>
        </polygon>
      ))}

      {/* Missing X overlay */}
      {isMissing && (
        <>
          <line
            x1={2}
            y1={2}
            x2={s - 2}
            y2={s - 2}
            stroke="#6B7280"
            strokeWidth={2}
            opacity={0.7}
          />
          <line
            x1={s - 2}
            y1={2}
            x2={2}
            y2={s - 2}
            stroke="#6B7280"
            strokeWidth={2}
            opacity={0.7}
          />
        </>
      )}

      {/* Implant marker */}
      {isImplant && (
        <circle
          cx={cx}
          cy={cy}
          r={inner * 0.6}
          fill="none"
          stroke="#06B6D4"
          strokeWidth={2}
          className="pointer-events-none"
        />
      )}

      {/* Tooth number */}
      <text
        x={cx}
        y={isUpper ? s + 11 : -4}
        textAnchor="middle"
        fontSize={8}
        fill="currentColor"
        className="pointer-events-none select-none opacity-60"
      >
        {toothNumber}
      </text>

      {/* Invisible overlay for context menu only — pointer-events: none for clicks */}
      <rect
        x={0}
        y={0}
        width={s}
        height={s}
        fill="transparent"
        opacity={0}
        style={{ pointerEvents: "none" }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToothStatusChange(toothNumber);
        }}
      />
    </g>
  );
}

export const ToothSVG = memo(ToothSVGComponent);
