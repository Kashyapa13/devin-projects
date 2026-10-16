/**
 * Launcher — boots the emitter FIRST (telemetry.ts side-effect), then
 * dynamically imports the app so pg/pino load under instrumentation.
 * `buildServer` lives in ./app.js; tests import it directly with no OTel.
 */
await import("./telemetry.js");
const { buildServer } = await import("./app.js");
const { Pool } = await import("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = await buildServer({
  db: pool,
  readiness: { db: () => pool.query("SELECT 1") },
});
await app.listen({
  port: Number(process.env.PORT ?? 8080),
  host: "0.0.0.0",
});
