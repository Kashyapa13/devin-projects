import { metricsRegistry, type MetricsRegistry } from "@company/observability";
import { ApiError } from "@company/http";
import { AnswerCache } from "./cache.js";
import { currentWatermark } from "./watermark.js";
import { cacheKey, runFenced, type Queryable } from "./ask/executor.js";
import { generate, Unparseable } from "./ask/nl.js";
import { FencedRejection } from "./ask/fence.js";
import { renderAggQuery, type Dim, type Metric } from "./ask/templates.js";

export interface Deps {
  db: Queryable;
  cache: AnswerCache;
  metrics: MetricsRegistry;
}

export interface Actor {
  sub: string;
  roles: string[];
}

interface Rows {
  rows: Record<string, unknown>[];
}
const rowsOf = (r: unknown): Record<string, unknown>[] => (r as Rows).rows ?? [];

export function defaultMetrics(): MetricsRegistry {
  const m = metricsRegistry("refundlens");
  m.histogram("ask_ms");
  m.counter("ask_success");
  m.counter("fence_rejected_total");
  m.gauge("sync_lag_s");
  m.counter("cache_hit");
  m.counter("export_total");
  return m;
}

async function logAsk(
  deps: Deps,
  entry: {
    userId: string;
    question: string;
    sql: string | null;
    ms: number;
    rows: number;
    success: boolean;
    fenceReason?: string | undefined;
    reqId: string;
  },
): Promise<void> {
  try {
    await deps.db.query(
      `INSERT INTO refundlens.ask_log
         (user_id, surface, question, rendered_sql, ms, rows, success, fence_reason, req_id)
       VALUES ($1, 'ask', $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.userId,
        entry.question,
        entry.sql,
        Math.round(entry.ms),
        entry.rows,
        entry.success,
        entry.fenceReason ?? null,
        entry.reqId,
      ],
    );
  } catch {
    // evidence write must not fail the answer path; absence is itself
    // detectable via fork_report coverage — logged by the logger anyway
  }
}

function answerOf(frame: { metric: string; dim: string }, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "no refunds in that window";
  const total = rows.reduce((s, r) => s + Number(r.value ?? 0), 0);
  return `${total.toLocaleString("en-US")} — ${frame.metric} by ${frame.dim}`;
}

/**
 * POST /ask — the anchor slice. Envelope is mandatory:
 * {answer, sql, rows, watermark, took_ms, cached} — watermark on EVERY
 * surface (its absence is a P1, so it is always present here).
 */
export async function ask(
  deps: Deps,
  actor: Actor,
  question: string,
  reqId: string,
): Promise<Record<string, unknown>> {
  const t0 = process.hrtime.bigint();
  let gen;
  try {
    gen = generate(question);
  } catch (e) {
    if (e instanceof Unparseable) {
      throw new ApiError(
        "QUESTION_UNPARSEABLE",
        "I could not turn that into a refund question",
        400,
        { hint: "try: 'how many refunds by channel last 30 days' or 'refund amount by reason'" },
      );
    }
    throw e;
  }

  const key = cacheKey(gen.query.sql, gen.query.params);
  const hit = deps.cache.get(key);
  if (hit) {
    deps.metrics.counter("cache_hit").inc();
    const env = hit.envelope as Record<string, unknown>;
    return { ...env, cached: true, took_ms: hit.cacheMs };
  }

  const wm = await currentWatermark(deps.db);
  try {
    const { rows, ms } = await runFenced(deps.db, gen.query.sql, gen.query.params);
    const envelope: Record<string, unknown> = {
      answer: answerOf(gen.query.frame, rows),
      understood: gen.understood,
      sql: gen.query.sql,
      params: gen.query.params,
      rows: rows.slice(0, 100),
      row_count: rows.length,
      watermark: wm.watermark,
      took_ms: ms,
      cached: false,
    };
    deps.cache.set(key, envelope);
    deps.metrics.counter("ask_success").inc(1, { outcome: "ok" });
    deps.metrics.histogram("ask_ms").observe(ms);
    await logAsk(deps, {
      userId: actor.sub,
      question,
      sql: gen.query.sql,
      ms: Number(process.hrtime.bigint() - t0) / 1e6,
      rows: rows.length,
      success: true,
      reqId,
    });
    return envelope;
  } catch (e) {
    if (e instanceof FencedRejection) {
      deps.metrics.counter("ask_success").inc(1, { outcome: "fenced" });
      deps.metrics.counter("fence_rejected_total").inc(1, { reason: e.reason });
      await logAsk(deps, {
        userId: actor.sub,
        question,
        sql: gen.query.sql,
        ms: Number(process.hrtime.bigint() - t0) / 1e6,
        rows: 0,
        success: false,
        fenceReason: e.reason,
        reqId,
      });
      throw new ApiError("FENCED_QUERY_REJECTED", e.message, 400, {
        reason: e.reason,
        guidance: e.guidance,
      });
    }
    deps.metrics.counter("ask_success").inc(1, { outcome: "error" });
    throw e;
  }
}

/**
 * GET /export.csv — exact counts only, WATERMARK in the header comment,
 * and BYPASSES the 60s cache entirely (AGENTS.md §4 — caching exports
 * is forbidden). Renders through the same fenced template path.
 */
export async function exportCsv(
  deps: Deps,
  actor: Actor,
  reqId: string,
): Promise<{ csv: string; rowCount: number }> {
  const now = new Date();
  const to = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
  const q = renderAggQuery({
    dim: "day" as Dim,
    metric: "count" as Metric,
    from,
    to,
    limit: 5000,
  });
  // no cache lookup — the cache never sees export traffic
  const { rows } = await runFenced(deps.db, q.sql, q.params);
  const wm = await currentWatermark(deps.db);
  deps.metrics.counter("export_total").inc();
  const lines = [
    `# refundlens export — watermark: ${wm.watermark ?? "unknown"}`,
    "day,count",
    ...rows.map(
      (r) =>
        `${r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10)},${Number(r.value)}`,
    ),
    `# rows: ${rows.length}`,
  ];
  return { csv: lines.join("\n") + "\n", rowCount: rows.length };
}
