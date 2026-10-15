import type { ReactElement } from "react";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 7×24 hour-of-day × day-of-week heatmap (F-14). Empty cells render as
 *  empty — never an error state. */
export function Heatmap({
  cells,
  cell = 14,
  onSelect,
  selected,
}: {
  cells: { dow: number; hour: number; v: number }[];
  cell?: number;
  onSelect?: (c: { dow: number; hour: number }) => void;
  selected?: { dow: number; hour: number } | null;
}): ReactElement {
  const grid = new Map<string, number>();
  let max = 0;
  for (const c of cells) {
    grid.set(`${c.dow}:${c.hour}`, (grid.get(`${c.dow}:${c.hour}`) ?? 0) + c.v);
    if ((grid.get(`${c.dow}:${c.hour}`) ?? 0) > max) max = grid.get(`${c.dow}:${c.hour}`)!;
  }
  const labelW = 30;
  const headH = 14;
  return (
    <svg
      width={labelW + 24 * cell}
      height={headH + 7 * cell}
      role="img"
      data-chart="heatmap"
      style={{ display: "block", maxWidth: "100%" }}
    >
      {Array.from({ length: 24 }, (_, h) =>
        h % 3 === 0 ? (
          <text key={h} x={labelW + h * cell + cell / 2} y={headH - 4} fontSize={8} fill="#888" textAnchor="middle">
            {h}
          </text>
        ) : null,
      )}
      {Array.from({ length: 7 }, (_, d) => (
        <text key={d} x={labelW - 4} y={headH + d * cell + cell / 2 + 3} fontSize={9} fill="#888" textAnchor="end">
          {DOW[d]}
        </text>
      ))}
      {Array.from({ length: 7 }, (_, d) =>
        Array.from({ length: 24 }, (_, h) => {
          const v = grid.get(`${d}:${h}`) ?? 0;
          const sel = selected?.dow === d && selected.hour === h;
          return (
            <rect
              key={`${d}:${h}`}
              x={labelW + h * cell}
              y={headH + d * cell}
              width={cell - 1}
              height={cell - 1}
              rx={2}
              fill="#2563eb"
              opacity={v === 0 ? 0.06 : 0.15 + (v / Math.max(max, 1)) * 0.85}
              stroke={sel ? "#dc2626" : "none"}
              strokeWidth={sel ? 1.5 : 0}
              style={{ cursor: onSelect ? "pointer" : "default" }}
              onClick={() => onSelect?.({ dow: d, hour: h })}
            >
              <title>{`${DOW[d]} ${h}:00 — ${v}`}</title>
            </rect>
          );
        }),
      )}
    </svg>
  );
}
