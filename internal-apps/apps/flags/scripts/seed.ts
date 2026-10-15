// flags-seed-v1 — synthetic demo flags only; never real flag keys.
import pg from "pg";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const flags = [
  { key: "demo-hero", env: "dev", desc: "hero variant on the /demo page", t: { default_enabled: true } },
  { key: "demo-new-nav", env: "dev", desc: "nav experiment", t: { default_enabled: false } },
  { key: "demo-checkout-v2", env: "staging", desc: "checkout rewrite", t: { enabled_if: { bucket_lt: 25 } } },
  { key: "demo-hero", env: "prod", desc: "hero variant prod", t: { default_enabled: false } },
];
for (const f of flags)
  await db.query(`INSERT INTO flags (key,env,description,targeting) VALUES ($1,$2,$3,$4)
    ON CONFLICT (key,env) DO NOTHING`, [f.key, f.env, f.desc, JSON.stringify(f.t)]);
await db.query(`INSERT INTO flag_audit_events (flag_id,actor,action,detail)
  SELECT id,'seed','create','{"seed":"flags-seed-v1"}' FROM flags WHERE key LIKE 'demo-%'
    AND NOT EXISTS (SELECT 1 FROM flag_audit_events a WHERE a.flag_id=flags.id AND action='create')`);
console.log("seeded", flags.length); await db.end();
