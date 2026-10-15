import type { ReactElement } from "react";

/**
 * Charts — the ONE charting foundation (RL-GAP W1, ADR-0015).
 * SVG only, zero deps; draw-in comes from the motion primitives
 * (Reveal/stagger on the wrapping card) — no chart carries its own
 * animation code.
 */

export function Sparkline({
  points,
  width = 120,
  height = 32,
  color = "currentColor",
  fill = true,
}: {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
}): ReactElement {
  const w = width;
  const h = height;
  const pad = 1;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = Math.max(max - min, 1);
  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const coords = points.map(
    (p, i) => `${(pad + i * step).toFixed(1)},${(h - pad - ((p - min) / span) * (h - pad * 2)).toFixed(1)}`,
  );
  const line = `M${coords.join(" L")}`;
  const area = `${line} L${(pad + (points.length - 1) * step).toFixed(1)},${h} L${pad},${h} Z`;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      style={{ display: "block", overflow: "visible" }}
    >
      {fill && points.length > 1 && (
        <path d={area} fill={color} opacity={0.15} stroke="none" />
      )}
      {points.length > 1 && (
        <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      )}
      {points.length === 1 && <circle cx={w / 2} cy={h / 2} r={2} fill={color} />}
    </svg>
  );
}
