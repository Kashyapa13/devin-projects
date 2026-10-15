import { describe, it, expect } from "vitest";
import cases from "./golden/cases.json" with { type: "json" };
import { evaluate } from "../api/src/engine.js";
import { parseSignals } from "../api/src/signals.js";
import { packs } from "../strategies/packs.js";
import { setKillSwitch, isKilled, type Db } from "../api/src/kill.js";

const sig = (o: Partial<any>) => ({ case_id: "t", signal_version: 1,
  risk_score: 50, doc_verification: "PASS", country_tier: "T2",
  watchlist_hits: 0, tenure_days: 200, velocity: 1, ml_scores: [], ...o } as any);

describe("pack suite — declared precedence, first-match wins", () => {
  it("escalate beats approve when both fire (watchlist trumps clean)", () => {
    const d = evaluate(sig({ risk_score: 10, watchlist_hits: 1, country_tier: "T1", tenure_days: 300 }));
    expect(d.decision).toBe("ESCALATE");
    expect(d.pack_id).toBe("high-risk-escalate");
    expect(d.fired_rule).toBe("esc.watchlist");
  });
  it("doc anomaly beats approve-candidate", () => {
    const d = evaluate(sig({ risk_score: 10, doc_verification: "MISMATCH", country_tier: "T1", tenure_days: 300 }));
    expect(d.pack_id).toBe("doc-anomaly-review");
    expect(d.reason_code).toBe("DOC_ISSUE");
  });
  it("approve-candidate fires only inside the band", () => {
    const d = evaluate(sig({ risk_score: 10, country_tier: "T1", tenure_days: 300 }));
    expect(d.decision).toBe("APPROVE"); expect(d.pack_id).toBe("low-risk-approve-candidate");
    const out = evaluate(sig({ risk_score: 10, country_tier: "T2", tenure_days: 300 }));
    expect(out.pack_id).toBe("default-to-human");
  });
  it("velocity anomaly on young+fast accounts", () => {
    const d = evaluate(sig({ tenure_days: 10, velocity: 6, risk_score: 40 }));
    expect(d.fired_rule).toBe("vel.young-fast");
  });
  it("every pack has a version + updatedAt", () => {
    for (const p of packs) { expect(p.version).toMatch(/^\d+\.\d+\.\d+$/); expect(p.updatedAt).toBeTruthy(); }
  });
});

describe("golden set — 220 adjudicated cases must match or flag (never silently flip)", () => {
  it("engine output equals adjudicated decision on all 220", () => {
    const flips: string[] = [];
    for (const c of cases) {
      const d = evaluate(c as any);
      if (d.decision !== c.expected) flips.push(`${c.case_id}: got ${d.decision} want ${c.expected}`);
    }
    expect(flips).toEqual([]);
  });
});

describe("signal contract", () => {
  it("unknown major version → clean rejection, never guessing", () => {
    expect(parseSignals({ signal_version: 99, case_id: "x" }).ok).toBe(false);
    expect(parseSignals({ signal_version: 1, case_id: "x", risk_score: 1,
      doc_verification: "PASS", country_tier: "T1", watchlist_hits: 0,
      tenure_days: 1, velocity: 0, ml_scores: [] }).ok).toBe(true);
    expect(parseSignals({ case_id: "x" }).ok).toBe(false);
  });
});

describe("kill switch drill", () => {
  it("engaged → 503 all-human + in-flight frozen; released → live", async () => {
    const calls: any[] = [];
    const db: Db = { query: async (sql, p) => {
      calls.push([sql, p]);
      if (sql.includes("engine_state") && sql.startsWith("SELECT")) return { rows: [{ value: true }] };
      return { rows: [] };
    } };
    await setKillSwitch(db, true);
    expect(calls.some(([s]) => s.includes("UPDATE shadow_decisions SET frozen = true"))).toBe(true);
    expect(await isKilled(db)).toBe(true);
  });
});
