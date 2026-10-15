import type { ReactElement } from "react";

/** Top-N horizontal bars (F-15) — server-sorted rows; clicking a column
 *  header re-queries (no client-side re-sort of a different metric). */
export function TopBars({
  rows,
  labelWidth = 90,
  barHeight = 16,
  width = 420,
  onSelect,
  selected,
}: {
  rows: { label: string; v: number }[];
  labelWidth?: number;
  barHeight?: number;
  width?: number;
  onSelect?: (label: string) => void;
  selected?: string | null;
}): ReactElement {
  const max = Math.max(...rows.map((r) => r.v), 1);
  const barW = width - labelWidth - 52;
  return (
    <div data-chart="topbars" style={{ display: "grid", gap: 3 }}>
      {rows.map((r) => {
        const dim = selected && selected !== r.label ? 0.35 : 1;
        return (
          <div
            key={r.label}
            role={onSelect ? "button" : undefined}
            tabIndex={onSelect ? 0 : undefined}
            onClick={() => onSelect?.(r.label)}
            onKeyDown={(e) => e.key === "Enter" && onSelect?.(r.label)}
            style={{ display: "flex", alignItems: "center", gap: 8, cursor: onSelect ? "pointer" : "default", opacity: dim }}
          >
            <span style={{ width: labelWidth, fontSize: 11, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.label}
            </span>
            <svg width={barW + 44} height={barHeight} style={{ display: "block" }}>
              <rect width={Math.max((r.v / max) * barW, 1.5)} height={barHeight - 4} y={2} rx={3} fill="#2563eb">
                <title>{`${r.label}: ${r.v}`}</title>
              </rect>
              <text x={Math.max((r.v / max) * barW, 1.5) + 5} y={barHeight - 5} fontSize={10} fill="#888">
                {r.v.toLocaleString("en-US")}
              </text>
            </svg>
          </div>
        );
      })}
    </div>
  );
}
