import { fileURLToPath } from "node:url";

/**
 * fork_report — the weekly evidence for OPEN-1 #conversational-vs-pbi.
 * Computes the ask-vs-filter session split from ask_log (AGENTS.md §5).
 * Runs until the dated fork decision lands; removing it early =
 * pre-judging the fork = STOP-condition.
 *
 * "Filter" side coverage note: view-console instrumentation lands with
 * F-01 (the console feature). Until then the report emits the ask side
 * fully and marks the split as instrumented-partial — honest coverage,
 * not a guessed number.
 */
const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const dsn = process.env.DATABASE_URL;
  if (!dsn) throw new Error("DATABASE_URL is required (vault)");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: dsn });
  try {
    const r = await pool.query(`
      SELECT date_trunc('week', created_at)::date AS week,
             COUNT(*)::int AS asks,
             COUNT(DISTINCT user_id)::int AS ask_users,
             COUNT(*) FILTER (WHERE success)::int AS ok,
             COUNT(*) FILTER (WHERE NOT success)::int AS fenced
      FROM refundlens.ask_log
      GROUP BY 1 ORDER BY 1 DESC
      LIMIT 8`);
    const weeks = r.rows as Record<string, unknown>[];
    const report = {
      generated_at: new Date().toISOString(),
      fork: "conversational-vs-pbi",
      threshold: "ask-box <20% of sessions at week 4 → retirement ADR",
      coverage: "ask-side instrumented (ask_log); view-side pending F-01",
      weeks,
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}
