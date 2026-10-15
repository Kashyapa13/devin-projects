import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Donut,
  Heatmap,
  KpiCard,
  KpiGrid,
  LiveDot,
  Pressable,
  Reveal,
  Scatter,
  staggerChild,
  StaggerTbody,
  StaggerTr,
  staggerParent,
  TimeSeries,
  TopBars,
  useReducedMotion,
  type TsSeries,
} from "@company/ui";
import { api } from "./api.js";

/**
 * /dashboard — the Power BI replacement surface (ADR-0015, F-09..F-16).
 * WIDGET LAW: every number comes from GET /api/widgets/:name typed
 * params — this file renders, never aggregates. Cross-filter: clicking a
 * series/segment/bar writes the matching global filter into the URL —
 * all state is query params, so a saved view is a shareable link.
 * SSE: each heartbeat beat invalidates the widget queries — re-bind,
 * never reload. Watermark chip on the bar, LiveDot from beat age.
 */

interface Beat {
  watermark: string | null;
  last_event_at: string | null;
  beat_at: string;
  rows: number;
  lag_s: number | null;
  status: "ok" | "degraded";
  detail?: string;
}

interface WidgetResult {
  widget: string;
  series: Record<string, unknown>[];
  compare?: Record<string, unknown>[];
  stats?: { mean: number; stddev: number; upper: number };
  anomalies?: { bucket: string; z: number }[];
  watermark: string | null;
}

/** URL hash state: #/dashboard?<query> — saved views are links. */
function readParams(): URLSearchParams {
  if (typeof location === "undefined") return new URLSearchParams(); // SSR
  const i = location.hash.indexOf("?");
  return new URLSearchParams(i >= 0 ? location.hash.slice(i + 1) : "");
}

function setParam(key: string, value: string | null): void {
  const p = readParams();
  if (value === null || value === "") p.delete(key);
  else p.set(key, value);
  location.hash = `#/dashboard?${p.toString()}`;
}

function useHashParams(): URLSearchParams {
  const [p, setP] = useState(readParams);
  useEffect(() => {
    const on = () => setP(readParams());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return p;
}

const PRESETS: { key: string; hours: number }[] = [
  { key: "24h", hours: 24 },
  { key: "7d", hours: 7 * 24 },
  { key: "30d", hours: 30 * 24 },
  { key: "90d", hours: 90 * 24 },
  { key: "12M", hours: 365 * 24 },
];

function rangeOf(p: URLSearchParams): { from: string; to: string; preset: string } {
  const preset = p.get("range") ?? "30d";
  const customFrom = p.get("from");
  const customTo = p.get("to");
  if (preset === "custom" && customFrom && customTo) {
    return { from: `${customFrom}T00:00:00Z`, to: `${customTo}T23:59:59Z`, preset };
  }
  const h = PRESETS.find((x) => x.key === preset)?.hours ?? 30 * 24;
  // Quantize `to` to the minute — a per-render timestamp would change the
  // query key every render and loop refetches forever.
  const to = new Date();
  to.setSeconds(0, 0);
  const from = new Date(to.getTime() - h * 3_600_000);
  return { from: from.toISOString(), to: to.toISOString(), preset };
}

function useWidget(name: string, params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const qs = q.toString();
  return useQuery({
    queryKey: ["widget", name, qs],
    queryFn: () => api(`/api/widgets/${name}${qs ? `?${qs}` : ""}`) as Promise<WidgetResult>,
    refetchOnWindowFocus: false,
  });
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function DashboardPage() {
  const { t } = useTranslation();
  const params = useHashParams();
  const reduced = useReducedMotion();
  const qc = useQueryClient();
  const [beat, setBeat] = useState<Beat | null>(null);
  const [live, setLive] = useState(false);

  const { from, to, preset } = rangeOf(params);
  const compare = params.get("compare") === "1";
  const stacked = params.get("stacked") === "1";
  const topSort = params.get("sort") ?? "count";
  const tsDim = params.get("tsdim") ?? "channel";

  const base: Record<string, string | undefined> = {
    from,
    to,
    channel: params.get("channel") ?? undefined,
    segment: params.get("segment") ?? undefined,
    reason: params.get("reason") ?? undefined,
    state: params.get("state") ?? undefined,
    ...(compare ? { compare: "1" } : {}),
  };
  const grain = preset === "24h" ? "hour" : "day";

  const kpi = useWidget("kpi", base);
  const ts = useWidget("timeseries", { ...base, grain, dim: tsDim });
  const rate = useWidget("timeseries", { ...base, grain, dim: "channel", metric: "count" });
  const heat = useWidget("heatmap", base);
  const donut = useWidget("donut", { ...base, dim: "reason_code" });
  const topn = useWidget("topn", { ...base, dim: "merchant_segment", sort: topSort, top: "10" });
  const scatter = useWidget("scatter", { ...base, limit: "800" });
  const detail = useWidget("detail", { ...base, limit: "50" });
  const monitors = useWidget("monitors_panel", {});
  const syncHealth = useWidget("sync_health", { limit: "5" });

  // SSE — each beat re-binds widgets (invalidateQueries), never a reload.
  useEffect(() => {
    const tok = localStorage.getItem("refundlens_token") ?? "";
    const es = new EventSource(`/api/stream/heartbeat?token=${encodeURIComponent(tok)}`);
    es.onmessage = (ev) => {
      try {
        setBeat(JSON.parse(ev.data) as Beat);
        setLive(true);
        void qc.invalidateQueries({ queryKey: ["widget"] });
      } catch {
        // malformed beat — keep the last good one
      }
    };
    es.onerror = () => setLive(false);
    return () => es.close();
  }, [qc]);

  // time series → per-dim series + per-bucket totals (for KPI sparklines)
  const { series, totals } = useMemo(() => {
    const byDim = new Map<string, { x: number; y: number }[]>();
    const tot = new Map<number, number>();
    for (const r of ts.data?.series ?? []) {
      const x = new Date(String(r.bucket)).getTime();
      const v = num(r.v) ?? 0;
      const dim = String(r.dim ?? "");
      const arr = byDim.get(dim) ?? [];
      arr.push({ x, y: v });
      byDim.set(dim, arr);
      tot.set(x, (tot.get(x) ?? 0) + v);
    }
    const s: TsSeries[] = [...byDim.entries()].map(([key, points]) => ({ key, points }));
    const t2 = [...tot.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    return { series: s, totals: t2 };
  }, [ts.data]);

  const k = (kpi.data?.series ?? [])[0] ?? {};
  const kc = (kpi.data?.compare ?? [])[0] ?? {};
  const deltaOf = (key: string): number | null => {
    if (!compare || kc[key] === undefined) return null;
    const a = num(kc[key]);
    const b = num(k[key]);
    if (a === null || b === null || a === 0) return null;
    return (b - a) / Math.abs(a);
  };

  const filterChip = (label: string, key: string, on: boolean) => (
    <Pressable
      key={key}
      onClick={() => setParam(key, on ? null : label)}
      aria-label={`${key}=${label}`}
      className={`chip${on ? " chip-on" : ""}`}
    >
      {label}
    </Pressable>
  );

  const clickDim = (paramKey: string) => (label: string) =>
    setParam(paramKey, params.get(paramKey) === label ? null : label);

  const wm =
    beat?.watermark ?? kpi.data?.watermark ?? ts.data?.watermark ?? detail.data?.watermark ?? null;

  const opts = {
    channel: [...new Set((topn.data?.series ?? []).map((r) => String(r.label)))],
    // segments from topn; channels from the timeseries dims; reasons from donut
    reason: [...new Set((donut.data?.series ?? []).map((r) => String(r.label)))],
    state: [...new Set((detail.data?.series ?? []).map((r) => String(r.state)))],
  };
  const channelOpts = series.map((s) => s.key);

  const empty = (w: { series: unknown[] } | undefined, testId: string) =>
    w && w.series.length === 0 ? (
      <p className="empty-hint" data-testid={`${testId}-empty`}>{t("dash.empty")}</p>
    ) : null;

  const exportCsv = async () => {
    const res = await fetch("/api/v1/export.csv", {
      headers: { authorization: `Bearer ${localStorage.getItem("refundlens_token") ?? ""}` },
    });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "refundlens-export.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const detailRows = (detail.data?.series ?? []) as Record<string, unknown>[];
  const monRows = (monitors.data?.series ?? []) as Record<string, unknown>[];

  return (
    <main className="dash">
      {/* F-09 global bar — presets · compare · filters · shareable params */}
      <header className="dashbar">
        <div className="dashbar-row">
          {PRESETS.map((p) => (
            <Pressable
              key={p.key}
              className={`chip${preset === p.key ? " chip-on" : ""}`}
              aria-label={t(`dash.range.${p.key}`)}
              onClick={() => setParam("range", p.key)}
            >
              {t(`dash.range.${p.key}`)}
            </Pressable>
          ))}
          <Pressable
            className={`chip${preset === "custom" ? " chip-on" : ""}`}
            aria-label={t("dash.range.custom")}
            onClick={() => setParam("range", "custom")}
          >
            {t("dash.range.custom")}
          </Pressable>
          {preset === "custom" && (
            <>
              <input
                type="date"
                aria-label={t("dash.from")}
                value={params.get("from") ?? ""}
                onChange={(e) => setParam("from", e.target.value)}
              />
              <input
                type="date"
                aria-label={t("dash.to")}
                value={params.get("to") ?? ""}
                onChange={(e) => setParam("to", e.target.value)}
              />
            </>
          )}
          <Pressable
            className={`chip${compare ? " chip-on" : ""}`}
            aria-label={t("dash.compare")}
            onClick={() => setParam("compare", compare ? null : "1")}
          >
            {t("dash.compare")}
          </Pressable>
          <span className="spacer" />
          <span className="wm-chip" data-testid="watermark-chip">
            <LiveDot
              beatAt={beat?.beat_at ?? null}
              watermark={beat?.watermark ?? wm}
              lastEventAt={beat?.last_event_at ?? null}
            />
            {" "}
            {t("dash.watermark")} {wm ? new Date(wm).toLocaleTimeString() : "—"}
            {beat && (
              <span className={`beat-${beat.status}`}>
                {live ? t("dash.live") : t("dash.degraded")}
              </span>
            )}
          </span>
        </div>
        <div className="dashbar-row filters" data-testid="global-filters">
          <span className="flabel">{t("dash.filters")}</span>
          {channelOpts.map((c) => filterChip(c, "channel", params.get("channel") === c))}
          {opts.reason.map((r) => filterChip(r, "reason", params.get("reason") === r))}
          {opts.state.map((s) => filterChip(s, "state", params.get("state") === s))}
          {(params.get("channel") ?? params.get("segment") ?? params.get("reason") ?? params.get("state")) && (
            <Pressable
              className="chip"
              aria-label={t("dash.clearFilters")}
              onClick={() => {
                for (const k2 of ["channel", "segment", "reason", "state"]) setParam(k2, null);
              }}
            >
              {t("dash.clearFilters")}
            </Pressable>
          )}
        </div>
      </header>

      {/* F-12 — KPI stat row, 8 cards; delta chip when compare is on */}
      <Reveal className="kpi-wrap">
      <KpiGrid>
        <KpiCard label={t("dash.kpi.refundsToday")} value={num(k.refunds_today) ?? "—"} spark={totals} delta={deltaOf("refunds_today")} />
        <KpiCard label={t("dash.kpi.refundRate")} value={num(k.refund_rate_pct) ?? "—"} format={(v) => `${v.toFixed(1)}%`} delta={deltaOf("refund_rate_pct")} />
        <KpiCard label={t("dash.kpi.totalRefunded")} value={num(k.total_refunded_cents) ?? "—"} format={(v) => `$${(v / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`} delta={deltaOf("total_refunded_cents")} />
        <KpiCard label={t("dash.kpi.pending")} value={num(k.pending_count) ?? "—"} delta={deltaOf("pending_count")} onSelect={() => setParam("state", params.get("state") === "PENDING" ? null : "PENDING")} selected={params.get("state") === "PENDING"} />
        <KpiCard label={t("dash.kpi.pendingAmt")} value={num(k.pending_cents) ?? "—"} format={(v) => `$${(v / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`} delta={deltaOf("pending_cents")} />
        <KpiCard label={t("dash.kpi.avgLatency")} value={num(k.avg_ms) ?? "—"} format={(v) => `${Math.round(v)}ms`} delta={deltaOf("avg_ms")} />
        <KpiCard label={t("dash.kpi.p95Latency")} value={num(k.p95_ms) ?? "—"} format={(v) => `${Math.round(v)}ms`} delta={deltaOf("p95_ms")} />
        <KpiCard label={t("dash.kpi.atRisk")} value={num(k.at_risk_count) ?? "—"} delta={deltaOf("at_risk_count")} onSelect={() => setParam("state", params.get("state") === "PENDING" ? null : "PENDING")} selected={params.get("state") === "PENDING"} />
      </KpiGrid>
      </Reveal>

      {/* F-13 — volume + amount by dim (stacked toggle); rate trend w/ band + heuristic anomalies */}
      <div className="grid2">
        <Reveal className="card" delay={0.02}>
          <section data-testid="w-timeseries">
            <h2>
              {t("dash.w.volume")}
              <Pressable className={`chip${stacked ? " chip-on" : ""}`} aria-label={t("dash.stacked")} onClick={() => setParam("stacked", stacked ? null : "1")}>
                {t("dash.stacked")}
              </Pressable>
              {["channel", "merchant_segment", "reason_code"].map((d) => (
                <Pressable key={d} className={`chip${tsDim === d ? " chip-on" : ""}`} aria-label={d} onClick={() => setParam("tsdim", d)}>
                  {t(`dash.dim.${d}`)}
                </Pressable>
              ))}
            </h2>
            <TimeSeries
              series={series}
              stacked={stacked}
              anomalies={(ts.data?.anomalies ?? []).map((a) => ({ x: new Date(a.bucket).getTime(), label: `z=${a.z} (${t("dash.heuristic")})` }))}
              anomalyLabel={t("dash.heuristic")}
              onSelect={tsDim === "channel" ? clickDim("channel") : tsDim === "merchant_segment" ? clickDim("segment") : clickDim("reason")}
              selectedKey={
                tsDim === "channel" ? params.get("channel") : tsDim === "merchant_segment" ? params.get("segment") : params.get("reason")
              }
            />
            {empty(ts.data, "w-timeseries")}
          </section>
        </Reveal>
        <Reveal className="card" delay={0.05}>
          <section data-testid="w-rate">
            <h2>{t("dash.w.rateTrend")}</h2>
            <TimeSeries
              series={[
                {
                  key: t("dash.w.rateTrend"),
                  points: Array.from(
                    [...(rate.data?.series ?? [])]
                      .reduce((m, r) => {
                        const x = new Date(String(r.bucket)).getTime();
                        m.set(x, (m.get(x) ?? 0) + (num(r.v) ?? 0));
                        return m;
                      }, new Map<number, number>())
                      .entries(),
                    ([x, y]) => ({ x, y }),
                  ).sort((a, b) => a.x - b.x),
                },
              ]}
              {...(rate.data?.stats ? { band: { y0: rate.data.stats.mean, y1: rate.data.stats.upper, label: `+3σ (${t("dash.heuristic")})` } } : {})}
              anomalies={(rate.data?.anomalies ?? []).map((a) => ({ x: new Date(a.bucket).getTime(), label: `z=${a.z} (${t("dash.heuristic")})` }))}
              anomalyLabel={t("dash.heuristic")}
            />
            {empty(rate.data, "w-rate")}
          </section>
        </Reveal>
      </div>

      <div className="grid3">
        <Reveal className="card" delay={0.08}>
          <section data-testid="w-heatmap">
            <h2>{t("dash.w.heatmap")}</h2>
            <Heatmap cells={(heat.data?.series ?? []).map((r) => ({ dow: num(r.dow) ?? 0, hour: num(r.hour) ?? 0, v: num(r.v) ?? 0 }))} />
            {empty(heat.data, "w-heatmap")}
          </section>
        </Reveal>
        <Reveal className="card" delay={0.1}>
          <section data-testid="w-donut">
            <h2>{t("dash.w.donut")}</h2>
            <Donut
              slices={(donut.data?.series ?? []).map((r) => ({ label: String(r.label), v: num(r.v) ?? 0 }))}
              onSelect={clickDim("reason")}
              selected={params.get("reason")}
            />
            {empty(donut.data, "w-donut")}
          </section>
        </Reveal>
        <Reveal className="card" delay={0.12}>
          <section data-testid="w-topn">
            <h2>
              {t("dash.w.topn")}
              {["count", "amount", "rate"].map((s) => (
                <Pressable key={s} className={`chip${topSort === s ? " chip-on" : ""}`} aria-label={s} onClick={() => setParam("sort", s)}>
                  {t(`dash.sort.${s}`)}
                </Pressable>
              ))}
            </h2>
            <TopBars
              rows={(topn.data?.series ?? []).map((r) => ({ label: String(r.label), v: num(topSort === "amount" ? r.amount : topSort === "rate" ? r.rate : r.cnt) ?? 0 }))}
              onSelect={clickDim("segment")}
              selected={params.get("segment")}
            />
            {empty(topn.data, "w-topn")}
          </section>
        </Reveal>
      </div>

      <div className="grid2">
        <Reveal className="card" delay={0.14}>
          <section data-testid="w-scatter">
            <h2>{t("dash.w.scatter")}</h2>
            <Scatter points={(scatter.data?.series ?? []).map((r) => ({ x: num(r.x) ?? 0, y: num(r.y) ?? 0 }))} />
            {empty(scatter.data, "w-scatter")}
          </section>
        </Reveal>
        <Reveal className="card" delay={0.16}>
          <section data-testid="w-monitors">
            <h2>{t("dash.w.monitors")}</h2>
            <ul className="monitors">
              {monRows.map((m) => (
                <li key={String(m.name)} className={`mon-${String(m.state ?? (m.enabled ? "ok" : "off"))}`}>
                  <b>{String(m.name)}</b>{" "}
                  <span className="pill">{String(m.state ?? (m.enabled === false ? t("dash.monOff") : "ok"))}</span>{" "}
                  <span className="mono">{String(m.severity)}</span>
                  {m.last_fired ? <span className="mono"> · {new Date(String(m.last_fired)).toLocaleString()}</span> : null}
                </li>
              ))}
            </ul>
            {empty(monitors.data, "w-monitors")}
            <h2>{t("dash.w.sync")}</h2>
            <ul className="monitors">
              {(syncHealth.data?.series ?? []).map((r) => (
                <li key={String(r.id)}>
                  <span className={`pill ${r.status === "success" ? "mon-ok" : "mon-firing"}`}>{String(r.status)}</span>{" "}
                  <span className="mono">{String(r.rows)} rows · {r.finished_at ? new Date(String(r.finished_at)).toLocaleTimeString() : "—"}</span>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      </div>

      {/* F-16 — detail table + export (exact counts, watermark header) */}
      <Reveal className="card" delay={0.18}>
        <section data-testid="w-detail">
          <h2>
            {t("dash.w.detail")}
            <Pressable className="chip" aria-label={t("dash.export")} onClick={() => void exportCsv()}>
              {t("dash.export")}
            </Pressable>
          </h2>
          <table className="rows">
            <thead>
              <tr>
                {["id", "txn_ref", "occurred_at", "channel", "merchant_segment", "amount_cents", "reason_code", "state", "latency_ms"].map((c) => (
                  <th key={c}>{t(`dash.col.${c}`)}</th>
                ))}
              </tr>
            </thead>
            <StaggerTbody variants={staggerParent} initial="hidden" animate="show">
              {detailRows.map((r, i) => (
                <StaggerTr key={String(r.id ?? i)} variants={staggerChild(reduced === true)}>
                  <td>{String(r.id)}</td>
                  <td>{String(r.txn_ref)}</td>
                  <td>{new Date(String(r.occurred_at)).toLocaleString()}</td>
                  <td>
                    <button type="button" className="linkcell" onClick={() => clickDim("channel")(String(r.channel))}>{String(r.channel)}</button>
                  </td>
                  <td>
                    <button type="button" className="linkcell" onClick={() => clickDim("segment")(String(r.merchant_segment))}>{String(r.merchant_segment)}</button>
                  </td>
                  <td>{((num(r.amount_cents) ?? 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}</td>
                  <td>
                    <button type="button" className="linkcell" onClick={() => clickDim("reason")(String(r.reason_code))}>{String(r.reason_code)}</button>
                  </td>
                  <td>
                    <button type="button" className="linkcell" onClick={() => clickDim("state")(String(r.state))}>{String(r.state)}</button>
                  </td>
                  <td>{String(r.latency_ms)}ms</td>
                </StaggerTr>
              ))}
            </StaggerTbody>
          </table>
          {empty(detail.data, "w-detail")}
        </section>
      </Reveal>
    </main>
  );
}
