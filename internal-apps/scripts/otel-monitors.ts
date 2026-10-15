/**
 * `pnpm otel:monitors` — evaluate the LLD §Observability alert rules
 * against the local OTel backend (WI-9, ADR-0017). Reads Mimir (:9009)
 * PromQL and prints per-rule status: OK / FIRING / NO-DATA. Pure read —
 * no alertmanager, no notifications, zero paid services.
 *
 *   OTEL_MIMIR_URL=http://localhost:9009 pnpm otel:monitors
 */
const MIMIR = process.env.OTEL_MIMIR_URL ?? "http://localhost:9090";

interface Rule {
  id: string;
  severity: "page" | "ticket";
  window: string;
  promql: string;
  note: string;
}

/** fastlane AGENTS.md §6 + refundlens §8 alert rules. */
const RULES: Rule[] = [
  {
    id: "fastlane.audit_write_fail",
    severity: "page",
    window: "10m",
    promql: `increase(fastlane_audit_write_fail_total[10m])`,
    note: ">0 → page",
  },
  {
    id: "fastlane.queue_load_p95",
    severity: "page",
    window: "10m",
    promql: `histogram_quantile(0.95, sum by (le) (rate(fastlane_queue_load_ms_bucket[10m])))`,
    note: ">1000ms for 10m → page",
  },
  {
    id: "fastlane.sla_breach_delta",
    severity: "page",
    window: "1h",
    promql: `delta(fastlane_sla_breach_count[1h])`,
    note: "+20%/h → page (here: absolute delta shown)",
  },
  {
    id: "fastlane.queue_load_p95_ticket",
    severity: "ticket",
    window: "30m",
    promql: `histogram_quantile(0.95, sum by (le) (rate(fastlane_queue_load_ms_bucket[30m])))`,
    note: ">300ms for 30m → ticket",
  },
  {
    id: "refundlens.sync_lag_ticket",
    severity: "ticket",
    window: "15m",
    promql: `max_over_time(refundlens_sync_lag_s[15m])`,
    note: ">5400s → ticket, >10800s → page",
  },
  {
    id: "refundlens.fenced_rate",
    severity: "ticket",
    window: "1h",
    promql: `increase(refundlens_ask_success_total{outcome="fenced"}[1h]) / increase(refundlens_ask_success_total[1h])`,
    note: ">25%/h → ticket",
  },
];

async function instantQuery(promql: string): Promise<number | "no-data" | "error"> {
  const url = `${MIMIR}/api/v1/query?query=${encodeURIComponent(promql)}`;
  try {
    const res = await fetch(url);
    const body = (await res.json()) as {
      status?: string;
      data?: { resultType?: string; result?: { value: [number, string] }[] };
    };
    const v = body.data?.result?.[0]?.value?.[1];
    if (v === undefined) return "no-data";
    const n = Number(v);
    return Number.isFinite(n) ? n : "no-data";
  } catch {
    return "error";
  }
}

let anyFiring = false;
for (const rule of RULES) {
  const v = await instantQuery(rule.promql);
  let status: string;
  if (v === "no-data" || v === "error") {
    status = v.toUpperCase();
  } else {
    const firing =
      (rule.id === "fastlane.audit_write_fail" && v > 0) ||
      (rule.id === "fastlane.queue_load_p95" && v > 1000) ||
      (rule.id === "fastlane.queue_load_p95_ticket" && v > 300) ||
      (rule.id === "refundlens.sync_lag_ticket" && v > 5400) ||
      (rule.id === "refundlens.fenced_rate" && v > 0.25) ||
      (rule.id === "fastlane.sla_breach_delta" && v > 0);
    status = firing ? "FIRING" : "ok";
    if (firing) anyFiring = true;
  }
  const val = typeof v === "number" ? v.toFixed(3) : "-";
  console.log(
    `${status.padEnd(7)} ${rule.id.padEnd(32)} ${rule.severity.padEnd(6)} value=${val.padEnd(10)} (${rule.note})`,
  );
}
process.exit(anyFiring ? 2 : 0);
