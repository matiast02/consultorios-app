"use client";

import { ToothSVG } from "./tooth-svg";
import type { OdontogramData, Face, FaceStatus, ToothGeneralStatus } from "./odontogram-types";
import {
  UPPER_RIGHT,
  UPPER_LEFT,
  LOWER_LEFT,
  LOWER_RIGHT,
  FACE_CYCLE,
  createEmptyOdontogram,
} from "./odontogram-types";

interface OdontogramProps {
  data: OdontogramData;
  onChange: (data: OdontogramData) => void;
  activeTool: FaceStatus | "missing" | "implant";
  readOnly?: boolean;
}

const TOOTH_SIZE = 38;
const TOOTH_GAP = 4;
const PADDING = 16;
const LABEL_HEIGHT = 16;

export function Odontogram({
  data,
  onChange,
  activeTool,
  readOnly = false,
}: OdontogramProps) {
  const teethPerRow = 16; // 8 per quadrant
  const rowWidth = teethPerRow * (TOOTH_SIZE + TOOTH_GAP);
  const svgWidth = rowWidth + PADDING * 2;
  const svgHeight = (TOOTH_SIZE + LABEL_HEIGHT) * 2 + 40 + PADDING * 2; // 2 rows + gap + padding

  function handleFaceClick(toothNumber: string, face: Face) {
    if (readOnly) return;

    const newData = { ...data, teeth: { ...data.teeth } };
    const tooth = { ...newData.teeth[toothNumber] };
    const faces = { ...tooth.faces };

    if (activeTool === "missing" || activeTool === "implant") {
      // Tool mode: apply missing/implant to whole tooth
      return;
    }

    // Apply active tool directly
    const currentStatus = faces[face] ?? "healthy";
    if (activeTool === currentStatus) {
      // If same tool, reset to healthy
      delete faces[face];
    } else {
      faces[face] = activeTool;
    }

    tooth.faces = faces;
    newData.teeth[toothNumber] = tooth;
    onChange(newData);
  }

  function handleToothStatusChange(toothNumber: string) {
    if (readOnly) return;

    const newData = { ...data, teeth: { ...data.teeth } };
    const tooth = { ...newData.teeth[toothNumber] };

    // Cycle: healthy → missing → implant → healthy
    const cycle: ToothGeneralStatus[] = ["healthy", "missing", "implant"];
    const currentIdx = cycle.indexOf(tooth.status);
    tooth.status = cycle[(currentIdx + 1) % cycle.length];

    // Clear faces when marking as missing
    if (tooth.status === "missing") {
      tooth.faces = {};
    }

    newData.teeth[toothNumber] = tooth;
    onChange(newData);
  }

  function renderRow(
    teeth: string[],
    startX: number,
    startY: number,
    isUpper: boolean
  ) {
    return teeth.map((toothNum, i) => {
      const x = startX + i * (TOOTH_SIZE + TOOTH_GAP);
      const y = startY;
      const toothData = data.teeth[toothNum] ?? {
        status: "healthy" as const,
        faces: {},
      };

      return (
        <g key={toothNum} transform={`translate(${x}, ${y})`}>
          <ToothSVG
            toothNumber={toothNum}
            data={toothData}
            size={TOOTH_SIZE}
            activeTool={activeTool}
            onFaceClick={handleFaceClick}
            onToothStatusChange={handleToothStatusChange}
            isUpper={isUpper}
          />
        </g>
      );
    });
  }

  const upperY = PADDING;
  const lowerY = PADDING + TOOTH_SIZE + LABEL_HEIGHT + 24;
  const quadrantGap = 12; // gap between right and left quadrants

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full max-w-[720px] mx-auto"
        style={{ minWidth: 600 }}
      >
        {/* Quadrant labels */}
        <text
          x={PADDING + (8 * (TOOTH_SIZE + TOOTH_GAP)) / 2}
          y={upperY - 4}
          textAnchor="middle"
          fontSize={9}
          fill="currentColor"
          className="opacity-40 select-none"
        >
          Superior Derecho (1)
        </text>
        <text
          x={PADDING + 8 * (TOOTH_SIZE + TOOTH_GAP) + quadrantGap + (8 * (TOOTH_SIZE + TOOTH_GAP)) / 2}
          y={upperY - 4}
          textAnchor="middle"
          fontSize={9}
          fill="currentColor"
          className="opacity-40 select-none"
        >
          Superior Izquierdo (2)
        </text>

        {/* Upper row */}
        {renderRow(UPPER_RIGHT, PADDING, upperY, true)}
        {renderRow(
          UPPER_LEFT,
          PADDING + 8 * (TOOTH_SIZE + TOOTH_GAP) + quadrantGap,
          upperY,
          true
        )}

        {/* Center dividing line */}
        <line
          x1={PADDING}
          y1={upperY + TOOTH_SIZE + LABEL_HEIGHT + 8}
          x2={svgWidth - PADDING}
          y2={upperY + TOOTH_SIZE + LABEL_HEIGHT + 8}
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.2}
        />
        {/* Vertical midline */}
        <line
          x1={svgWidth / 2}
          y1={upperY - 8}
          x2={svgWidth / 2}
          y2={lowerY + TOOTH_SIZE + LABEL_HEIGHT + 4}
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.15}
          strokeDasharray="4 2"
        />

        {/* Lower row */}
        {renderRow(LOWER_RIGHT.slice().reverse(), PADDING, lowerY, false)}
        {renderRow(
          LOWER_LEFT.slice().reverse(),
          PADDING + 8 * (TOOTH_SIZE + TOOTH_GAP) + quadrantGap,
          lowerY,
          false
        )}

        {/* Lower quadrant labels */}
        <text
          x={PADDING + (8 * (TOOTH_SIZE + TOOTH_GAP)) / 2}
          y={lowerY + TOOTH_SIZE + LABEL_HEIGHT + 14}
          textAnchor="middle"
          fontSize={9}
          fill="currentColor"
          className="opacity-40 select-none"
        >
          Inferior Derecho (4)
        </text>
        <text
          x={PADDING + 8 * (TOOTH_SIZE + TOOTH_GAP) + quadrantGap + (8 * (TOOTH_SIZE + TOOTH_GAP)) / 2}
          y={lowerY + TOOTH_SIZE + LABEL_HEIGHT + 14}
          textAnchor="middle"
          fontSize={9}
          fill="currentColor"
          className="opacity-40 select-none"
        >
          Inferior Izquierdo (3)
        </text>
      </svg>
    </div>
  );
}
