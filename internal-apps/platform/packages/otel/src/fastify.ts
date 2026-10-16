import FastifyOtelInstrumentation from "@fastify/otel";
import type { FastifyPluginAsync } from "fastify";

/**
 * The official Fastify OTel instrumentation (first-party, maintained by
 * the Fastify authors — the contrib module was deprecated in its favor).
 * Registered as a plugin inside buildServer so route patching needs no
 * ESM loader hooks: spans for every route + hook, W3C context extracted
 * from inbound headers.
 *
 * With no SDK running this resolves the global no-op tracer provider —
 * near-zero overhead, safe to register unconditionally.
 */
export function otelFastifyPlugin(): FastifyPluginAsync {
  return new FastifyOtelInstrumentation().plugin();
}
