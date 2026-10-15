import { createHash } from "node:crypto";
import {
  context,
  metrics,
  trace,
  type SpanContext,
  type SpanKind,
  type SpanStatusCode,
} from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import type { IdGenerator } from "@opentelemetry/sdk-trace-base";
import { seededStream } from "./ids.js";
import { startOtel, type OtelHandle } from "./emitter.js";

/* ------------------------------------------------------------------ *
 * Deterministic synthetic telemetry — seed `otel-seed-v1` (ADR-0017).
 *
 * A SeedPlan is a fully serializable description of one telemetry
 * stream: journeys as spans, metric point streams (including the
 * deliberate spike patterns monitors are tested against), and log
 * lines bound to spans. buildSeedPlan(seed) is pure: same seed →
 * identical plan → identical sha256 stream hash. emitSeedPlan ships it
 * over OTLP; wall-clock shift applied at emit keeps backend data fresh
 * without touching determinism.
 * ------------------------------------------------------------------ */

export interface SeedSpan {
  journey: string;
  name: string;
  traceId: string;
  spanId: string;
  /** spanId of the parent within the same journey. */
  parent?: string;
  startMs: number;
  durMs: number;
  kind: "server" | "client" | "internal";
  attrs: Record<string, string | number | boolean>;
  statusOk: boolean;
}

export interface SeedMetric {
  name: string;
  kind: "counter" | "gauge" | "histogram";
  value: number;
  labels?: Record<string, string>;
  atMs: number;
}

export interface SeedLog {
  level: "info" | "warn" | "error";
  msg: string;
  /** spanId the record correlates to. */
  spanRef?: string;
  attrs: Record<string, string | number | boolean>;
  atMs: number;
}

export interface SeedPlan {
  seed: string;
  baseMs: number;
  spans: SeedSpan[];
  metrics: SeedMetric[];
  logs: SeedLog[];
}

/** Fixed plan epoch — wall-clock shift happens at emit, never at build. */
const BASE_MS = Date.UTC(2026, 9, 15, 0, 0, 0);
const WINDOW_MS = 10 * 60 * 1000;

const SPAN_KIND: Record<SeedSpan["kind"], SpanKind> = {
  server: 2, // SpanKind.SERVER
  client: 3, // SpanKind.CLIENT
  internal: 1, // SpanKind.INTERNAL
};

/**
 * Build the deterministic plan for `seed`. The ID stream mirrors the
 * exact call pattern the SDK's idGenerator will perform at emit (roots
 * pull traceId, every span pulls spanId, strictly in plan order), so the
 * ids recorded here are the ids the backend will show.
 */
export function buildSeedPlan(seed = "otel-seed-v1"): SeedPlan {
  const ids = seededStream(seed);
  const spans: SeedSpan[] = [];
  const metricsOut: SeedMetric[] = [];
  const logsOut: SeedLog[] = [];

  const span = (
    journey: string,
    name: string,
    kind: SeedSpan["kind"],
    parent: SeedSpan | null,
    startMs: number,
    durMs: number,
    attrs: SeedSpan["attrs"] = {},
    statusOk = true,
  ): SeedSpan => {
    const s: SeedSpan = {
      journey,
      name,
      kind,
      traceId: parent ? parent.traceId : ids.traceId(),
      spanId: ids.spanId(),
      ...(parent ? { parent: parent.spanId } : {}),
      startMs,
      durMs,
      attrs,
      statusOk,
    };
    spans.push(s);
    return s;
  };
  const metric = (
    name: string,
    kind: SeedMetric["kind"],
    value: number,
    atMs: number,
    labels?: Record<string, string>,
  ) => metricsOut.push({ name, kind, value, ...(labels ? { labels } : {}), atMs });
  const log = (
    level: SeedLog["level"],
    msg: string,
    atMs: number,
    spanRef?: SeedSpan,
    attrs: SeedLog["attrs"] = {},
  ) =>
    logsOut.push({
      level,
      msg,
      ...(spanRef ? { spanRef: spanRef.spanId } : {}),
      attrs,
      atMs,
    });

  /* ---- Journey A: fastlane KYC claim → approve (server → pg spans) -- */
  const caseId = "11111111-2222-3333-4444-555555555555";
  const claim = span("fastlane.kyc.claim_approve", "request POST /api/v1/cases/:id/claim", "server", null, 0, 96, {
    "http.request.method": "POST",
    "http.route": "/api/v1/cases/:id/claim",
    "http.response.status_code": 200,
    "service.name": "fastlane",
  });
  span("fastlane.kyc.claim_approve", "preHandler", "internal", claim, 2, 4);
  const claimTx = span("fastlane.kyc.claim_approve", "pg.query: BEGIN", "client", claim, 8, 2, {
    "db.statement": "BEGIN", "db.system": "postgresql",
  });
  void claimTx;
  span("fastlane.kyc.claim_approve", "pg.query: UPDATE kyc_cases", "client", claim, 12, 14, {
    "db.statement": "UPDATE kyc_cases SET status = $2, assignee_id = ... WHERE id = $1 RETURNING ...",
    "db.system": "postgresql", "db.name": "fastlane",
  });
  span("fastlane.kyc.claim_approve", "pg.query: INSERT audit_events", "client", claim, 28, 6, {
    "db.statement": "INSERT INTO audit_events (actor, action, entity, entity_id, detail, req_id) VALUES ($1,$2,$3,$4,$5,$6)",
    "db.system": "postgresql", "db.name": "fastlane",
  });
  span("fastlane.kyc.claim_approve", "pg.query: COMMIT", "client", claim, 36, 2, {
    "db.statement": "COMMIT", "db.system": "postgresql",
  });
  log("info", "case claimed", 40, claim, {
    actor_id: "u-reviewer-7", case_id: caseId, action: "case.in_review", outcome: "ok",
  });

  const queueRead = span("fastlane.kyc.claim_approve", "request GET /api/v1/queue", "server", null, 120, 34, {
    "http.request.method": "GET", "http.route": "/api/v1/queue", "http.response.status_code": 200,
    "service.name": "fastlane",
  });
  span("fastlane.kyc.claim_approve", "pg.query: SELECT kyc_cases", "client", queueRead, 124, 18, {
    "db.statement": "SELECT id, customer_ref, country, risk_score, doc_type, status, priority, assignee_id, sla_due_at, version, created_at, updated_at FROM kyc_cases WHERE status IN ('PENDING','IN_REVIEW','ESCALATED') ORDER BY sla_due_at ASC, id ASC LIMIT $1",
    "db.system": "postgresql", "db.name": "fastlane",
  });
  log("info", "queue read", 142, queueRead, { tab: "team", rows: 25, outcome: "ok" });

  const approve = span("fastlane.kyc.claim_approve", "request POST /api/v1/cases/:id/approve", "server", null, 4000, 88, {
    "http.request.method": "POST", "http.route": "/api/v1/cases/:id/approve",
    "http.response.status_code": 200, "service.name": "fastlane",
  });
  span("fastlane.kyc.claim_approve", "pg.query: UPDATE kyc_cases", "client", approve, 4008, 12, {
    "db.statement": "UPDATE kyc_cases SET status = $2, ... WHERE id = $1 RETURNING ...",
    "db.system": "postgresql", "db.name": "fastlane",
  });
  span("fastlane.kyc.claim_approve", "pg.query: INSERT audit_events", "client", approve, 4022, 5, {
    "db.statement": "INSERT INTO audit_events ...", "db.system": "postgresql", "db.name": "fastlane",
  });
  log("info", "case approved", 4034, approve, {
    actor_id: "u-reviewer-7", case_id: caseId, action: "case.approved", outcome: "ok",
  });

  /* ---- Journey B: refundlens ask (server → fenced pg → ask_log) ----- */
  const ask = span("refundlens.ask", "request POST /api/v1/ask", "server", null, 2000, 212, {
    "http.request.method": "POST", "http.route": "/api/v1/ask",
    "http.response.status_code": 200, "service.name": "refundlens",
  });
  span("refundlens.ask", "pg.query: SELECT sync_runs", "client", ask, 2006, 6, {
    "db.statement": "SELECT watermark FROM refundlens.sync_runs WHERE status='success' ORDER BY watermark DESC LIMIT 1",
    "db.system": "postgresql", "db.name": "refundlens",
  });
  span("refundlens.ask", "pg.query: SELECT agg_daily", "client", ask, 2016, 148, {
    "db.statement": "SELECT day, channel, COUNT(*)::bigint AS value FROM refundlens.agg_daily WHERE day BETWEEN $1 AND $2 GROUP BY 1,2 ORDER BY 1 LIMIT 500",
    "db.system": "postgresql", "db.name": "refundlens", "refundlens.fenced": true,
  });
  span("refundlens.ask", "pg.query: INSERT ask_log", "client", ask, 2170, 7, {
    "db.statement": "INSERT INTO refundlens.ask_log (user_id, surface, question, rendered_sql, ms, rows, success, fence_reason, req_id) VALUES ($1,'ask',$2,$3,$4,$5,$6,$7,$8)",
    "db.system": "postgresql", "db.name": "refundlens",
  });
  log("info", "ask answered", 2182, ask, {
    user_id: "u-analyst-3", surface: "ask", ms: 182, rows: 60, cached: false, outcome: "ok",
  });

  /* ---- Metric streams ---------------------------------------------
   * Normal traffic then DELIBERATE spike patterns — each spike maps to
   * a constitutional alert rule so monitors demonstrably fire (§5).
   * -----------------------------------------------------------------*/

  // fastlane_queue_load_ms (h, tab): baseline p50≈180, then a 24-point
  // burst at 1100–1600ms — p95 > 1000ms breach (PAGE rule).
  for (let i = 0; i < 60; i++) {
    metric("fastlane_queue_load_ms", "histogram", ids.float(40, 300), i * 9000, {
      tab: ids.pick(["mine", "team", "breaching"] as const),
    });
  }
  for (let i = 0; i < 24; i++) {
    metric("fastlane_queue_load_ms", "histogram", ids.float(1100, 1600), 540000 + i * 1500, {
      tab: "team",
    });
  }

  // fastlane_transition_total (c, from,to,ok): steady flow + a burst of
  // guard-rejected edges (ok=no) at the end of the window.
  const edges: ReadonlyArray<readonly [string, string]> = [
    ["PENDING", "IN_REVIEW"], ["IN_REVIEW", "APPROVED"],
    ["IN_REVIEW", "REJECTED"], ["IN_REVIEW", "ESCALATED"], ["ESCALATED", "IN_REVIEW"],
  ];
  for (let i = 0; i < 80; i++) {
    const [from, to] = ids.pick(edges);
    metric("fastlane_transition_total", "counter", 1, i * 7000, { from, to, ok: "yes" });
  }
  for (let i = 0; i < 12; i++) {
    metric("fastlane_transition_total", "counter", 1, 560000 + i * 2500, {
      from: "PENDING", to: "APPROVED", ok: "no", // illegal edge → 400
    });
  }

  // fastlane_cases_active (g, status): gentle drift.
  let active = 41;
  for (let i = 0; i < 20; i++) {
    active = Math.max(28, active + ids.int(-4, 5));
    metric("fastlane_cases_active", "gauge", active, i * 30000, {
      status: ids.pick(["PENDING", "IN_REVIEW", "ESCALATED"] as const),
    });
  }

  // fastlane_sla_breach_count (g): flat then rising — +20%/h PAGE rule.
  for (let i = 0; i < 16; i++) {
    metric("fastlane_sla_breach_count", "gauge", i < 8 ? 6 : 6 + (i - 7) * 3, i * 36000);
  }

  // fastlane_pii_reveal_total (c): a few audited reveals.
  for (let i = 0; i < 4; i++) {
    metric("fastlane_pii_reveal_total", "counter", 1, 60000 + i * 90000);
  }

  // fastlane_audit_write_fail_total (c): ONE failure — the >0 PAGE rule.
  metric("fastlane_audit_write_fail_total", "counter", 1, 555000);

  // fastlane_keystroke_decision_ms (h): client-side distribution (seeded
  // until the web task wires real emission — OTEL-GAP §5).
  for (let i = 0; i < 40; i++) {
    metric("fastlane_keystroke_decision_ms", "histogram", ids.float(8, 140), i * 14000);
  }

  // refundlens_ask_ms (h) + ask_success (c, outcome): baseline healthy
  // then a fenced-rejection burst → >25%/h ticket rule.
  for (let i = 0; i < 50; i++) {
    metric("refundlens_ask_ms", "histogram", ids.float(60, 900), i * 11000);
    metric("refundlens_ask_success", "counter", 1, i * 11000, { outcome: "ok" });
  }
  for (let i = 0; i < 14; i++) {
    metric("refundlens_ask_ms", "histogram", ids.float(20, 80), 545000 + i * 3000);
    metric("refundlens_ask_success", "counter", 1, 545000 + i * 3000, { outcome: "fenced" });
    metric("refundlens_fence_rejected_total", "counter", 1, 545000 + i * 3000, {
      reason: ids.pick(["cost_cap", "no_limit", "banned_table"] as const),
    });
  }

  // refundlens_cache_hit (c) + export_total (c).
  for (let i = 0; i < 9; i++) metric("refundlens_cache_hit", "counter", 1, i * 60000);
  for (let i = 0; i < 3; i++) metric("refundlens_export_total", "counter", 1, i * 180000);

  // refundlens_sync_lag_s (g): ramp past the 5400s ticket line, crest
  // under the 10800s page line — demonstrates severity selectivity.
  for (let i = 0; i < 16; i++) {
    const v = i < 10 ? 1800 + i * 400 : 5800 - (i - 9) * 300;
    metric("refundlens_sync_lag_s", "gauge", v, i * 30000);
  }
  for (let i = 0; i < 14; i++) {
    log("info", "request completed", i * 43000);
  }
  log("warn", "queue_load_ms above page threshold", 560000);
  log("error", "audit write failed — transaction rolled back", 555100);

  return { seed, baseMs: BASE_MS, spans, metrics: metricsOut, logs: logsOut };
}

/** Canonical JSON → sha256. The determinism contract. */
export function planHash(plan: SeedPlan): string {
  return createHash("sha256").update(canonical(plan)).digest("hex");
}

function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

/* ------------------------------------------------------------------ *
 * Emission
 * ------------------------------------------------------------------ */

/** Deterministic idGenerator — replays the stream buildSeedPlan consumed. */
export function seedIdGenerator(seed: string): IdGenerator {
  const ids = seededStream(seed);
  return {
    generateTraceId: () => ids.traceId(),
    generateSpanId: () => ids.spanId(),
  };
}

export interface EmitResult {
  hash: string;
  spans: number;
  metrics: number;
  logs: number;
  endpoint: string;
}

/**
 * Ship a plan over OTLP. `endpoint` defaults to the collector env var.
 * Times shift so the plan's window ends at wall-clock now — the plan
 * itself (and its hash) is untouched.
 */
export async function emitSeedPlan(
  plan: SeedPlan,
  opts: { endpoint?: string; serviceName?: string } = {},
): Promise<EmitResult> {
  const handle: OtelHandle = startOtel({
    serviceName: opts.serviceName ?? "otel-seed",
    endpoint: opts.endpoint,
    metricIntervalMs: 500,
    idGenerator: seedIdGenerator(plan.seed),
  });
  if (!handle.enabled) {
    throw new Error(
      "otel-seed: no OTLP endpoint — set OTEL_EXPORTER_OTLP_ENDPOINT",
    );
  }

  const latest = Math.max(
    ...plan.spans.map((s) => s.startMs + s.durMs),
    ...plan.metrics.map((m) => m.atMs),
    ...plan.logs.map((l) => l.atMs),
    0,
  );
  const shift = Date.now() - (plan.baseMs + Math.min(latest, WINDOW_MS));

  // Tempo drops spans ingested with old timestamps (its live ingestion
  // slack is far shorter than the plan's ~10min window — verified against
  // otel-lgtm). Compress the span timeline into the last SPAN_WINDOW_MS
  // so every seeded span survives; metric/log streams keep the full
  // window (Mimir/Loki accept older timestamps).
  const SPAN_WINDOW_MS = 90_000;
  const spanLatest = Math.max(
    ...plan.spans.map((s) => s.startMs + s.durMs),
    1,
  );
  const spanScale = Math.min(1, SPAN_WINDOW_MS / spanLatest);
  const spanShift = Date.now() - (plan.baseMs + spanLatest * spanScale);

  const tracer = trace.getTracer("otel-seed");
  const spanById = new Map<string, { sc: SpanContext }>();
  for (const e of plan.spans) {
    const parent = e.parent ? spanById.get(e.parent) : undefined;
    const ctx = parent
      ? trace.setSpanContext(context.active(), parent.sc)
      : context.active();
    const s = tracer.startSpan(
      e.name,
      {
        kind: SPAN_KIND[e.kind],
        startTime: plan.baseMs + spanShift + e.startMs * spanScale,
        attributes: e.attrs,
      },
      ctx,
    );
    spanById.set(e.spanId, { sc: s.spanContext() });
    s.setStatus({
      code: (e.statusOk ? 1 : 2) as SpanStatusCode,
    });
    s.end(plan.baseMs + spanShift + (e.startMs + e.durMs) * spanScale);
  }

  const meter = metrics.getMeter("otel-seed");
  const instruments = new Map<string, { add?(v: number, a?: Record<string, string>): void; record?(v: number, a?: Record<string, string>): void }>();
  for (const m of plan.metrics) {
    let inst = instruments.get(m.name);
    if (!inst) {
      inst =
        m.kind === "counter"
          ? meter.createCounter(m.name)
          : m.kind === "gauge"
            ? meter.createGauge(m.name)
            : meter.createHistogram(m.name); // no unit — keeps names verbatim
      instruments.set(m.name, inst);
    }
    if (m.kind === "counter") inst.add?.(m.value, m.labels);
    else inst.record?.(m.value, m.labels);
  }

  const logger = logs.getLogger("otel-seed");
  const sev = { info: SeverityNumber.INFO, warn: SeverityNumber.WARN, error: SeverityNumber.ERROR } as const;
  for (const l of plan.logs) {
    const ref = l.spanRef ? spanById.get(l.spanRef) : undefined;
    const emit = () =>
      logger.emit({
        severityNumber: sev[l.level],
        severityText: l.level.toUpperCase(),
        body: l.msg,
        // span-correlated logs use the compressed span timeline so they
        // land inside their span in a trace view; free logs keep the window.
        timestamp:
          plan.baseMs +
          (l.spanRef ? spanShift + l.atMs * spanScale : shift + l.atMs),
        attributes: l.attrs,
      });
    if (ref) context.with(trace.setSpanContext(context.active(), ref.sc), emit);
    else emit();
  }

  // let the batcher/reader see data, then force-flush on shutdown
  await new Promise((r) => setTimeout(r, 750));
  await handle.shutdown();

  return {
    hash: planHash(plan),
    spans: plan.spans.length,
    metrics: plan.metrics.length,
    logs: plan.logs.length,
    endpoint: handle.endpoint ?? "",
  };
}
