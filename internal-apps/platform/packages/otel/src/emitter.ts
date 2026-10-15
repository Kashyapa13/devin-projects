import { trace, type SpanContext } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import type { Instrumentation } from "@opentelemetry/instrumentation";
import type { IdGenerator } from "@opentelemetry/sdk-trace-base";
import { AlwaysOnSampler, ParentBasedSampler, TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-base";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { resourceFromAttributes } from "@opentelemetry/resources";

export interface OtelInit {
  serviceName: string;
  serviceVersion?: string;
  /** OTLP/HTTP base — default env OTEL_EXPORTER_OTLP_ENDPOINT. */
  endpoint?: string | undefined;
  /** Metric export cadence (default 15s). */
  metricIntervalMs?: number;
  /** Override instrumentations (default: pg + pino). */
  instrumentations?: (Instrumentation | Instrumentation[])[];
  /** Deterministic IDs — seeder only. */
  idGenerator?: IdGenerator;
  /** Trace sample ratio 0..1 — env OTEL_TRACES_SAMPLER_RATIO fallback; default 1. */
  sampleRatio?: number;
  /** Extra resource attributes. */
  attributes?: Record<string, string | number | boolean>;
}

export interface OtelHandle {
  enabled: boolean;
  endpoint: string | null;
  /** Flush + stop providers. Safe to call when disabled (no-op). */
  shutdown(): Promise<void>;
}

let active: { endpoint: string } | null = null;
let sdk: NodeSDK | null = null;

/** True after startOtel() succeeded — cheap gate for app-side helpers. */
export function otelEnabled(): boolean {
  return active !== null;
}

/**
 * Boot the fleet OTel emitter (ADR-0017). No OTEL_EXPORTER_OTLP_ENDPOINT
 * → enabled:false and NOTHING is initialized — tests and collector-less
 * dev runs stay hermetic with zero export attempts.
 *
 * Call order matters for ESM: instrument this FIRST (the app's
 * telemetry.ts side-effect module), then dynamically import the app so
 * `pg`/`pino` are patched by require-in-the-middle when they load.
 * Fastify itself is instrumented by the @fastify/otel plugin registered
 * inside buildServer — no module patching needed there.
 */
export function startOtel(init: OtelInit): OtelHandle {
  if (sdk) return { enabled: true, endpoint: active?.endpoint ?? null, shutdown };
  const endpoint = (
    init.endpoint ??
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
    ""
  ).replace(/\/+$/, "");
  const disabled =
    endpoint.length === 0 || /^true$/i.test(process.env.OTEL_SDK_DISABLED ?? "");
  if (disabled) {
    return { enabled: false, endpoint: null, shutdown: async () => {} };
  }

  const ratio =
    init.sampleRatio ??
    Number(process.env.OTEL_TRACES_SAMPLER_RATIO ?? "1");
  const sdkInit: ConstructorParameters<typeof NodeSDK>[0] = {
    resource: resourceFromAttributes({
      "service.name": init.serviceName,
      "service.version": init.serviceVersion ?? "0.0.0",
      "deployment.environment.name": process.env.APP_ENV ?? "dev",
      ...(init.attributes ?? {}),
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
      exportIntervalMillis: init.metricIntervalMs ?? 15_000,
    }),
    logRecordProcessors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({ url: `${endpoint}/v1/logs` }),
      }),
    ],
    instrumentations:
      init.instrumentations ??
      defaultInstrumentations(),
    sampler:
      ratio >= 1
        ? new AlwaysOnSampler()
        : new ParentBasedSampler({
            root: new TraceIdRatioBasedSampler(Math.max(0, ratio)),
          }),
    ...(init.idGenerator ? { idGenerator: init.idGenerator } : {}),
  };
  sdk = new NodeSDK(sdkInit);
  sdk.start();
  active = { endpoint };

  const flush = () => {
    void sdk?.shutdown().catch(() => {});
  };
  process.once("SIGTERM", flush);
  process.once("SIGINT", flush);

  return { enabled: true, endpoint, shutdown };
}

function defaultInstrumentations(): Instrumentation[] {
  return [
    new PgInstrumentation(),
    new PinoInstrumentation({
      // injects trace_id/span_id/trace_flags into every log record —
      // stdout lines AND the OTLP log records the instrumentation ships.
      disableLogCorrelation: false,
      disableLogSending: false,
    }),
  ];
}

async function shutdown(): Promise<void> {
  const s = sdk;
  sdk = null;
  active = null;
  await s?.shutdown();
}

/**
 * Standalone helpers shared by emitter consumers — a remote/non-recording
 * SpanContext lets callers attach log records or spans to a known trace
 * (seeder emission, log correlation).
 */
export function remoteSpanContext(
  traceId: string,
  spanId: string,
  sampled = true,
): SpanContext {
  return { traceId, spanId, traceFlags: sampled ? 1 : 0, isRemote: true };
}

export { trace };
