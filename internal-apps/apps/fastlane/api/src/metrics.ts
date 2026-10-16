import { otelRegistry, type DualRegistry } from "@company/otel";

/**
 * The constitutional metric names (AGENTS.md §6, LLD §Observability) as
 * OTel instruments — same names, same labels — alongside the in-process
 * /metrics exposition (ADR-0017: transport everything, rename nothing).
 */
export function defaultMetrics(): DualRegistry {
  const m = otelRegistry("fastlane");
  m.histogram("queue_load_ms");
  m.counter("transition_total");
  m.counter("audit_write_fail_total");
  m.histogram("keystroke_decision_ms"); // client-side — emitted by seeder/web, not the API
  m.counter("pii_reveal_total");
  // cases_active + sla_breach_count are observable gauges — registered at
  // route time where the DB probe lives (see routes.ts).
  return m;
}
