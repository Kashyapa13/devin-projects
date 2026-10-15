export {
  startOtel,
  otelEnabled,
  remoteSpanContext,
  trace,
  type OtelInit,
  type OtelHandle,
} from "./emitter.js";
export {
  otelRegistry,
  type DualRegistry,
  type ObservableGaugeOpts,
} from "./registry.js";
export { otelFastifyPlugin } from "./fastify.js";
export {
  buildSeedPlan,
  emitSeedPlan,
  planHash,
  seedIdGenerator,
  type SeedPlan,
  type SeedSpan,
  type SeedMetric,
  type SeedLog,
  type EmitResult,
} from "./seed.js";
export { fnv1a, mulberry32, seededStream, type SeededStream } from "./ids.js";
