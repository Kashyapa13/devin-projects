import type { ReactElement } from "react";
import { CHART_PALETTE } from "./TimeSeries.js";

/** Donut by dim (F-15) — stroke-segment rings + clickable legend. */
export function Donut({
  slices,
  size = 150,
  thickness = 22,
  onSelect,
  selected,
}: {
  slices: { label: string; v: number }[];
  size?: number;
  thickness?: number;
  onSelect?: (label: string) => void;
  selected?: string | null;
}): ReactElement {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + x.v, 0);
  let acc = 0;
  return (
    <div data-chart="donut" style={{ display: "flex", gap: 14, alignItems: "center" }}>
      <svg width={size} height={size} role="img" style={{ flexShrink: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#8882" strokeWidth={thickness} />
        {total > 0 &&
          slices.map((s, i) => {
            const frac = s.v / total;
            const off = acc;
            acc += frac;
            const dim = selected && selected !== s.label ? 0.25 : 1;
            return (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={CHART_PALETTE[i % CHART_PALETTE.length]!}
                strokeWidth={thickness}
                strokeDasharray={`${Math.max(frac * c - 1.5, 0)} ${c}`}
                strokeDashoffset={-off * c}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                opacity={dim}
                style={{ cursor: onSelect ? "pointer" : "default" }}
                onClick={() => onSelect?.(s.label)}
              >
                <title>{`${s.label}: ${s.v}`}</title>
              </circle>
            );
          })}
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize={18} fontWeight={700} fill="currentColor">
          {total.toLocaleString("en-US")}
        </text>
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fontSize={9} fill="#888">
          total
        </text>
      </svg>
      <div style={{ fontSize: 11, display: "grid", gap: 3 }}>
        {slices.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onSelect?.(s.label)}
            style={{
              border: "none", background: "none", cursor: "pointer", padding: 0, textAlign: "left",
              color: "currentColor", opacity: selected && selected !== s.label ? 0.4 : 1,
            }}
          >
            <span style={{ color: CHART_PALETTE[i % CHART_PALETTE.length]! }}>■</span> {s.label}
            <span style={{ opacity: 0.6 }}> — {total ? Math.round((s.v / total) * 100) : 0}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}
