import { startOtel } from "@company/otel";

/**
 * Side-effect module — imported FIRST by the server launcher so the OTel
 * SDK (and its require-in-the-middle hooks for pg/pino) is installed
 * before the app's modules load. No OTEL_EXPORTER_OTLP_ENDPOINT → no-op
 * (ADR-0017: the single env var; local → compose backend, prod → client).
 */
startOtel({ serviceName: "fastlane" });
