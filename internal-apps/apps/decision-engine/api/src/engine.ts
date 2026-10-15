import { packs, type Decision, type Pack } from "../../strategies/packs.js";
import type { CaseSignalsV1 } from "./signals.js";

export interface ShadowDecision {
  case_id: string; signal_version: number;
  pack_id: string; pack_version: string; fired_rule: string;
  decision: Decision; reason_code: string; confidence: number;
  inputs: CaseSignalsV1; rung: "SHADOW";
}

/** Deterministic core: rule eval over signals — explainable, reproducible. */
export function evaluate(s: CaseSignalsV1): ShadowDecision {
  for (const pack of packs)
    for (const rule of pack.rules)
      if (rule.when(s))
        return { case_id: s.case_id, signal_version: 1, pack_id: pack.id,
          pack_version: pack.version, fired_rule: rule.id, decision: rule.decide,
          reason_code: rule.reason, confidence: rule.confidence, inputs: s, rung: "SHADOW" };
  throw new Error("unreachable — default-to-human is last and matches all");
}

/** Stale-pack alert: pack untouched >90 days → flag for the writer. */
export function stalePacks(now = Date.now()): Pack[] {
  return packs.filter((p) => now - new Date(p.updatedAt).getTime() > 90 * 86400e3);
}
