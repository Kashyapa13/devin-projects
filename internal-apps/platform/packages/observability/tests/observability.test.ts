import { describe, expect, it } from "vitest";
import {
  alertManifest,
  isLogLine,
  log,
  metricsRegistry,
  type LogLine,
} from "../src/index.js";

describe("metricsRegistry", () => {
  it("namespaces every metric", () => {
    const m = metricsRegistry("fastlane");
    m.counter("requests").inc(2, { route: "/cases" });
    m.gauge("queue_depth").set(7);
    const out = m.render();
    expect(out).toContain("fastlane_requests{route=\"/cases\"} 2");
    expect(out).toContain("fastlane_queue_depth 7");
  });

  it("renders histogram count/sum and rejects redefinition", () => {
    const m = metricsRegistry("refundlens");
    m.histogram("etl_seconds").observe(1.5);
    m.histogram("etl_seconds").observe(2.5);
    expect(m.render()).toContain("refundlens_etl_seconds_count 2");
    expect(m.render()).toContain("refundlens_etl_seconds_sum 4");
    expect(() => m.counter("etl_seconds")).toThrow(/redefined/);
  });

  it("counters cannot go down", () => {
    const m = metricsRegistry("app");
    expect(() => m.counter("x").inc(-1)).toThrow(/negative/);
  });
});

describe("log schema", () => {
  const line: LogLine = {
    ts: new Date(0).toISOString(),
    level: "info",
    service: "fastlane",
    msg: "case claimed",
    req_id: "req-1",
  };

  it("emits schema-validated JSON", () => {
    let captured = "";
    log(line, (l) => (captured = l));
    expect(JSON.parse(captured)).toMatchObject({
      level: "info",
      service: "fastlane",
      req_id: "req-1",
    });
  });

  it("rejects malformed lines", () => {
    expect(isLogLine(line)).toBe(true);
    expect(isLogLine({ level: "nope", msg: "x" })).toBe(false);
    expect(() =>
      log({ ...line, level: "nope" as never }, () => {}),
    ).toThrow(/schema violation/);
  });
});

describe("alertManifest", () => {
  it("conforms to schema and keeps all alerts", () => {
    const manifest = alertManifest("fastlane", [
      {
        name: "queue_p95_high",
        expr: "histogram_quantile(0.95, fastlane_queue_seconds) > 1",
        for: "5m",
        severity: "page",
        summary: "Queue p95 above 1s SLO",
        runbook: "apps/fastlane/docs/RUNBOOK.md#queue-lag",
      },
      {
        name: "etl_idle",
        expr: "time() - refundlens_etl_last_success > 3600",
        severity: "ticket",
        summary: "ETL idle for 1h",
      },
    ]);
    expect(manifest.service).toBe("fastlane");
    expect(manifest.alerts).toHaveLength(2);
  });

  it("requires a runbook for page severity", () => {
    expect(() =>
      alertManifest("app", [
        {
          name: "boom",
          expr: "up == 0",
          severity: "page",
          summary: "down",
        },
      ]),
    ).toThrow(/runbook/);
  });
});
