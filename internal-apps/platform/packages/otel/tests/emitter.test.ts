import { afterEach, describe, expect, it } from "vitest";
import { otelEnabled, startOtel } from "../src/emitter.js";
import { otelRegistry } from "../src/registry.js";
import { metricsRegistry } from "@company/observability";

const ENV = "OTEL_EXPORTER_OTLP_ENDPOINT";

afterEach(() => {
  delete process.env[ENV];
});

describe("startOtel — no endpoint", () => {
  it("is a no-op when OTEL_EXPORTER_OTLP_ENDPOINT is unset (tests stay hermetic)", () => {
    delete process.env[ENV];
    const h = startOtel({ serviceName: "test-svc" });
    expect(h.enabled).toBe(false);
    expect(h.endpoint).toBeNull();
    expect(otelEnabled()).toBe(false);
  });

  it("no-op when the endpoint is empty or whitespace is not needed — empty string disables", () => {
    process.env[ENV] = "";
    const h = startOtel({ serviceName: "test-svc" });
    expect(h.enabled).toBe(false);
  });

  it("shutdown() is a safe no-op when disabled", async () => {
    const h = startOtel({ serviceName: "test-svc" });
    await expect(h.shutdown()).resolves.toBeUndefined();
  });
});

describe("otelRegistry — dual registry without SDK", () => {
  it("preserves instrument names + labels byte-for-byte in /metrics exposition", () => {
    const dual = otelRegistry("refundlens");
    const plain = metricsRegistry("refundlens");
    dual.counter("ask_success").inc(3, { outcome: "ok" });
    plain.counter("ask_success").inc(3, { outcome: "ok" });
    dual.histogram("ask_ms").observe(123);
    plain.histogram("ask_ms").observe(123);
    dual.gauge("sync_lag_s").set(42);
    plain.gauge("sync_lag_s").set(42);
    expect(dual.render()).toBe(plain.render());
    expect(dual.render()).toContain('refundlens_ask_success{outcome="ok"} 3');
    expect(dual.render()).toContain("refundlens_ask_ms_count 1");
    expect(dual.render()).toContain("refundlens_sync_lag_s 42");
  });

  it("writes through to the OTel meter without throwing when no SDK is running", () => {
    const dual = otelRegistry("fastlane");
    expect(() =>
      dual.counter("transition_total").inc(1, { from: "PENDING", to: "IN_REVIEW", ok: "yes" }),
    ).not.toThrow();
    expect(() =>
      dual.observableGauge("cases_active", () => 7, { labels: { status: "PENDING" } }),
    ).not.toThrow();
  });

  it("observableGauge refreshes the in-process series for /metrics", async () => {
    const dual = otelRegistry("fastlane");
    let v = 5;
    dual.observableGauge("sla_breach_count", () => v, { intervalMs: 5 });
    await new Promise((r) => setTimeout(r, 20));
    v = 9;
    await new Promise((r) => setTimeout(r, 20));
    expect(dual.render()).toContain("fastlane_sla_breach_count 9");
  });

  it("rejects redefining an instrument kind (inner contract)", () => {
    const dual = otelRegistry("fastlane");
    dual.counter("transition_total");
    expect(() => dual.gauge("transition_total")).toThrow(/redefined/);
  });
});
