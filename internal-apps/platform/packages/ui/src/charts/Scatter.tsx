import type { ReactElement } from "react";

/** Latency × amount scatter (F-15) — density shading: a coarse grid
 *  bucket count drives point opacity so dense regions read as mass. */
export function Scatter({
  points,
  width = 420,
  height = 180,
  onSelect,
}: {
  points: { x: number; y: number }[];
  width?: number;
  height?: number;
  onSelect?: (p: { x: number; y: number }) => void;
}): ReactElement {
  const pad = 26;
  const plotW = width - pad - 8;
  const plotH = height - pad - 8;
  const xMax = Math.max(...points.map((p) => p.x), 1);
  const yMax = Math.max(...points.map((p) => p.y), 1);
  const atX = (x: number) => pad + (x / xMax) * plotW;
  const atY = (y: number) => height - pad - (y / yMax) * plotH;

  const buckets = new Map<string, number>();
  for (const p of points) {
    const k = `${Math.round((p.x / xMax) * 12)}:${Math.round((p.y / yMax) * 12)}`;
    buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  const maxBucket = Math.max(...buckets.values(), 1);
  const dense = (p: { x: number; y: number }) =>
    (buckets.get(`${Math.round((p.x / xMax) * 12)}:${Math.round((p.y / yMax) * 12)}`) ?? 0) / maxBucket;

  return (
    <svg width={width} height={height} role="img" data-chart="scatter" style={{ display: "block", maxWidth: "100%" }}>
      <line x1={pad} y1={height - pad} x2={width - 6} y2={height - pad} stroke="#8885" />
      <line x1={pad} y1={8} x2={pad} y2={height - pad} stroke="#8885" />
      <text x={pad + 2} y={height - 10} fontSize={9} fill="#888">0</text>
      <text x={width - 8} y={height - 10} fontSize={9} fill="#888" textAnchor="end">{Math.round(xMax)}ms</text>
      <text x={pad - 4} y={12} fontSize={9} fill="#888" textAnchor="end">{Math.round(yMax / 100)}$</text>
      {points.map((p, i) => (
        <circle
          key={i}
          cx={atX(p.x)}
          cy={atY(p.y)}
          r={2.5}
          fill="#2563eb"
          opacity={0.15 + dense(p) * 0.6}
          style={{ cursor: onSelect ? "pointer" : "default" }}
          onClick={() => onSelect?.(p)}
        >
          <title>{`${p.x}ms · ${(p.y / 100).toFixed(2)}`}</title>
        </circle>
      ))}
    </svg>
  );
}
