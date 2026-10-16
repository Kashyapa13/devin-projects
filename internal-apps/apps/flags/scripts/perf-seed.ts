// perf-seed — the "10k flags × 1k users" budget fixture (TESTING.md PERF).
// Synthetic demo-perf-* keys only; deterministic; idempotent.
import pg from "pg";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const N = Number(process.env.PERF_FLAGS ?? 10_000);
// Half boolean-default flags, half bucket-gated — both eval code paths warm.
await db.query(
  `INSERT INTO flags (key, env, description, targeting)
   SELECT 'demo-perf-' || g, 'dev', 'perf fixture',
          CASE WHEN g % 2 = 0 THEN jsonb_build_object('default_enabled', (g % 4 = 0))
               ELSE jsonb_build_object('enabled_if', jsonb_build_object('bucket_lt', g % 100))
          END
   FROM generate_series(1, $1) AS g
   ON CONFLICT (key, env) DO NOTHING`,
  [N],
);
const { rows } = await db.query(
  `SELECT count(*)::int AS n FROM flags WHERE key LIKE 'demo-perf-%'`,
);
console.log(`perf seed: ${rows[0].n} demo-perf-* flags present (target ${N})`);
await db.end();
