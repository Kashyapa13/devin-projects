import type { ReactElement, ReactNode } from "react";
import { CountUp } from "../motion/primitives.js";
import { Sparkline } from "./Sparkline.js";

/** KPI stat card (F-12): CountUp value + sparkline + PoP delta chip +
 *  click-through (onSelect drives the cross-filter). */
export function KpiCard({
  label,
  value,
  format,
  delta,
  spark,
  onSelect,
  selected,
}: {
  label: string;
  value: number | string;
  /** format for numeric values (CountUp interpolates then formats) */
  format?: (n: number) => string;
  /** period-over-period delta fraction (0.05 = +5%) — null hides the chip */
  delta?: number | null;
  spark?: number[];
  onSelect?: () => void;
  selected?: boolean;
}): ReactElement {
  const numeric = typeof value === "number" && Number.isFinite(value);
  return (
    <button
      type="button"
      className="kpi-card"
      data-testid="kpi-card"
      onClick={onSelect}
      style={{
        display: "block", textAlign: "left", minWidth: 0, cursor: onSelect ? "pointer" : "default",
        border: selected ? "1.5px solid #2563eb" : "1px solid #9995",
        borderRadius: 8, padding: "10px 12px", background: "Canvas", color: "CanvasText",
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        {numeric ? <CountUp value={value} format={format ?? ((n) => Math.round(n).toLocaleString("en-US"))} /> : value}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        {spark && spark.length > 1 ? <Sparkline points={spark} width={88} height={22} color="#2563eb" /> : <span />}
        {delta !== undefined && delta !== null && (
          <span
            style={{
              fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "1px 7px",
              background: delta > 0 ? "#dc2626" : delta < 0 ? "#16a34a" : "#8884",
              color: delta === 0 ? "CanvasText" : "#fff",
            }}
          >
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {Math.abs(delta * 100).toFixed(1)}%
          </span>
        )}
      </div>
    </button>
  );
}

/** 8-card stat row — collapses to 4/2 columns on narrow surfaces. */
export function KpiGrid({ children }: { children: ReactNode }): ReactElement {
  return (
    <div
      className="kpi-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 10,
      }}
    >
      {children}
    </div>
  );
}
