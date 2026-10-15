import type { ReactElement } from "react";

export interface TsSeries {
  key: string;
  points: { x: number; y: number }[];
}

const PALETTE = [
  "#2563eb", "#16a34a", "#d97706", "#dc2626",
  "#7c3aed", "#0891b2", "#be185d", "#65a30d",
];
export const CHART_PALETTE = PALETTE;

/** Multi-series time chart: lines or stacked areas, optional threshold
 *  band + anomaly markers (always labeled, e.g. "heuristic"). */
export function TimeSeries({
  series,
  stacked = false,
  band,
  anomalies = [],
  anomalyLabel,
  height = 160,
  width = 560,
  onSelect,
  selectedKey,
}: {
  series: TsSeries[];
  stacked?: boolean;
  /** threshold band — shaded horizontal region {y0..y1} */
  band?: { y0: number; y1: number; label?: string };
  anomalies?: { x: number; label: string }[];
  anomalyLabel?: string;
  height?: number;
  width?: number;
  onSelect?: (key: string) => void;
  selectedKey?: string | null;
}): ReactElement {
  const padL = 34;
  const padB = 18;
  const padT = 6;
  const plotW = width - padL - 6;
  const plotH = height - padB - padT;

  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
  const xMin = xs[0] ?? 0;
  const xMax = xs[xs.length - 1] ?? 1;
  const xSpan = Math.max(xMax - xMin, 1);
  const atX = (x: number) => padL + ((x - xMin) / xSpan) * plotW;

  // stacked cumulative baseline per x
  const cum = new Map<number, number>();
  const stackedSeries = stacked
    ? series.map((s) => ({
        key: s.key,
        points: s.points.map((p) => {
          const base = cum.get(p.x) ?? 0;
          cum.set(p.x, base + p.y);
          return { x: p.x, y: p.y, base };
        }),
      }))
    : series.map((s) => ({ key: s.key, points: s.points.map((p) => ({ ...p, base: 0 })) }));

  const yMax = Math.max(
    1,
    ...stackedSeries.flatMap((s) => s.points.map((p) => p.y + (p.base ?? 0))),
    band ? band.y1 : 0,
  );
  const atY = (y: number) => padT + plotH - (y / yMax) * plotH;

  const fmtTick = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : `${Math.round(v)}`);
  const ticks = [0, 0.5, 1].map((f) => Math.round(yMax * f));

  return (
    <div data-chart="timeseries">
      <svg width={width} height={height} role="img" style={{ display: "block", maxWidth: "100%" }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - 4} y1={atY(t)} y2={atY(t)} stroke="#8883" strokeWidth={t === 0 ? 1.2 : 0.6} />
            <text x={padL - 4} y={atY(t) + 3} textAnchor="end" fontSize={9} fill="#888">{fmtTick(t)}</text>
          </g>
        ))}
        {band && (
          <rect
            x={padL}
            width={plotW}
            y={atY(band.y1)}
            height={Math.max(atY(band.y0) - atY(band.y1), 0)}
            fill="#d97706"
            opacity={0.12}
          />
        )}
        {band?.label && (
          <text x={width - 6} y={atY(band.y1) + 10} textAnchor="end" fontSize={9} fill="#d97706">{band.label}</text>
        )}
        {stackedSeries.map((s, i) => {
          const color = PALETTE[i % PALETTE.length]!;
          const pts = s.points.map((p) => `${atX(p.x).toFixed(1)},${atY(p.y + (p.base ?? 0)).toFixed(1)}`);
          if (pts.length === 0) return null;
          const line = `M${pts.join(" L")}`;
          const dim = selectedKey && selectedKey !== s.key ? 0.25 : 1;
          if (stacked) {
            const floor = s.points.map((p) => `${atX(p.x).toFixed(1)},${atY(p.base ?? 0).toFixed(1)}`).reverse();
            const area = `${line} L${floor.join(" L")} Z`;
            return <path key={s.key} d={area} fill={color} opacity={0.5 * dim} stroke={color} strokeWidth={1} />;
          }
          return <path key={s.key} d={line} fill="none" stroke={color} strokeWidth={1.6} opacity={dim} strokeLinejoin="round" />;
        })}
        {anomalies.map((a, i) => {
          // marker sits on the top edge of the total at that x
          const top = stacked ? (cum.get(a.x) ?? 0) : Math.max(...series.map((s) => s.points.find((p) => p.x === a.x)?.y ?? 0));
          return (
            <g key={i}>
              <circle cx={atX(a.x)} cy={atY(top)} r={4} fill="#dc2626" opacity={0.85}>
                <title>{a.label}</title>
              </circle>
            </g>
          );
        })}
        {anomalyLabel && anomalies.length > 0 && (
          <text x={padL + 4} y={padT + 10} fontSize={9} fill="#dc2626">{anomalyLabel}</text>
        )}
        <text x={padL} y={height - 4} fontSize={9} fill="#888">{xs.length ? new Date(xMin).toLocaleDateString() : ""}</text>
        <text x={width - 4} y={height - 4} fontSize={9} fill="#888" textAnchor="end">{xs.length ? new Date(xMax).toLocaleDateString() : ""}</text>
      </svg>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11 }}>
        {series.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onSelect?.(s.key)}
            style={{
              border: "none", background: "none", cursor: "pointer", padding: 0,
              color: PALETTE[i % PALETTE.length]!, fontWeight: selectedKey === s.key ? 700 : 400,
              opacity: selectedKey && selectedKey !== s.key ? 0.4 : 1,
            }}
          >
            ■ {s.key}
          </button>
        ))}
      </div>
    </div>
  );
}
