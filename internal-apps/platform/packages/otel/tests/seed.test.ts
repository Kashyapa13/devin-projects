import { describe, expect, it } from "vitest";
import { buildSeedPlan, planHash, seedIdGenerator } from "../src/seed.js";
import { seededStream } from "../src/ids.js";

describe("otel seeder — determinism (otel-seed-v1)", () => {
  it("same seed → identical stream hash", () => {
    const a = buildSeedPlan("otel-seed-v1");
    const b = buildSeedPlan("otel-seed-v1");
    expect(planHash(a)).toBe(planHash(b));
  });

  it("different seed → different stream", () => {
    const a = buildSeedPlan("otel-seed-v1");
    const b = buildSeedPlan("otel-seed-v2");
    expect(planHash(a)).not.toBe(planHash(b));
  });

  it("id stream is deterministic", () => {
    const a = seededStream("otel-seed-v1");
    const b = seededStream("otel-seed-v1");
    const seqA = [a.traceId(), a.spanId(), a.int(0, 1e6), a.float(0, 1)];
    const seqB = [b.traceId(), b.spanId(), b.int(0, 1e6), b.float(0, 1)];
    expect(seqA).toEqual(seqB);
  });

  it("seeded idGenerator replays the plan's id stream (roots: trace+span ids; children: span ids)", () => {
    const plan = buildSeedPlan("otel-seed-v1");
    const gen = seedIdGenerator("otel-seed-v1");
    // SDK call order per span: root → generateTraceId() then generateSpanId();
    // child → generateSpanId() only. Emission runs in plan order, so the
    // replay must be interleaved identically.
    for (const s of plan.spans) {
      if (!s.parent) expect(gen.generateTraceId()).toBe(s.traceId);
      expect(gen.generateSpanId()).toBe(s.spanId);
    }
  });
});

describe("otel seeder — plan content", () => {
  const plan = buildSeedPlan("otel-seed-v1");

  it("contains the KYC claim→approve journey trace", () => {
    const j = plan.spans.filter((s) => s.journey === "fastlane.kyc.claim_approve");
    const names = j.map((s) => s.name).join("|");
    expect(names).toContain("claim");
    expect(names).toContain("approve");
    expect(names).toContain("pg.query");
  });

  it("contains the refunds ask journey", () => {
    const j = plan.spans.filter((s) => s.journey === "refundlens.ask");
    expect(j.some((s) => s.name.includes("/api/v1/ask"))).toBe(true);
    expect(j.some((s) => s.name.includes("pg.query"))).toBe(true);
  });

  it("every child span references an existing parent in the same trace", () => {
    const byId = new Map(plan.spans.map((s) => [s.spanId, s]));
    for (const s of plan.spans) {
      if (s.parent) {
        const p = byId.get(s.parent);
        expect(p, `${s.name} parent`).toBeTruthy();
        expect(p!.traceId).toBe(s.traceId);
      }
    }
    expect(new Set(plan.spans.map((s) => s.spanId)).size).toBe(plan.spans.length);
  });

  it("deliberate spike patterns exist (monitors demonstrably fire)", () => {
    const queueObs = plan.metrics
      .filter((m) => m.name === "fastlane_queue_load_ms")
      .map((m) => m.value);
    expect(queueObs.some((v) => v > 1000)).toBe(true); // p95 page breach
    expect(queueObs.some((v) => v < 300)).toBe(true); // baseline traffic too
    const lag = plan.metrics
      .filter((m) => m.name === "refundlens_sync_lag_s")
      .map((m) => m.value);
    expect(Math.max(...lag)).toBeGreaterThan(5400); // ticket rule
    expect(Math.max(...lag)).toBeLessThan(10800); // but NOT page — selectivity
    const auditFail = plan.metrics.filter((m) => m.name === "fastlane_audit_write_fail_total");
    expect(auditFail.reduce((s, m) => s + m.value, 0)).toBeGreaterThan(0); // >0 PAGE rule
    const fenced = plan.metrics.filter((m) => m.name === "refundlens_fence_rejected_total");
    expect(fenced.length).toBeGreaterThan(0);
  });

  it("correlated logs reference seeded spans", () => {
    const byId = new Set(plan.spans.map((s) => s.spanId));
    const correlated = plan.logs.filter((l) => l.spanRef);
    expect(correlated.length).toBeGreaterThan(0);
    for (const l of correlated) expect(byId.has(l.spanRef!)).toBe(true);
  });
});
