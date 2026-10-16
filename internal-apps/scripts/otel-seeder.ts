/**
 * `pnpm otel:seed` — emit the deterministic otel-seed-v1 telemetry stream
 * (ADR-0017): fastlane KYC claim→approve journey, refundlens ask journey,
 * constitutional metric names incl. deliberate spike patterns, correlated
 * logs. Requires OTEL_EXPORTER_OTLP_ENDPOINT (local →
 * http://localhost:4318 from infra/otel/docker-compose.otel.yml).
 * Re-runnable: the plan is fixed at a base epoch; each run shifts the
 * window to end now so a fresh stream appears in the backend.
 */
import { buildSeedPlan, emitSeedPlan, planHash } from "@company/otel";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
if (!endpoint) {
  console.error(
    "OTEL_EXPORTER_OTLP_ENDPOINT unset — point it at the collector (local: http://localhost:4318).",
  );
  process.exit(1);
}

const seed = process.argv[2] ?? "otel-seed-v1";
const plan = buildSeedPlan(seed);
console.log(`seed=${seed} planHash=${planHash(plan)}`);
console.log(
  `emitting ${plan.spans.length} spans, ${plan.metrics.length} metric streams, ${plan.logs.length} log records → ${endpoint}`,
);
const res = await emitSeedPlan(plan, { endpoint });
console.log(
  `done: ${res.spans} spans, ${res.metrics} metric observations, ${res.logs} log records`,
);
