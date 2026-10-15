/** case_signals v1 — versioned contract (ADR-0018). Unknown major versions
    are REJECTED cleanly — the engine never guesses. */
export const SIGNAL_CONTRACT_VERSION = 1;

export interface MlScore {
  model_name: string; model_version: string;
  score: number; score_type: string;
}

export interface CaseSignalsV1 {
  case_id: string;
  risk_score: number;                    // 0–100
  doc_verification: "PASS" | "MISMATCH" | "UNSUPPORTED" | "PENDING";
  country_tier: "T1" | "T2" | "T3";
  watchlist_hits: number;                // count; 0 = none
  tenure_days: number;
  velocity: number;                      // tx/day
  ml_scores: MlScore[];                  // extensible — real ML slots in later
}

export function parseSignals(raw: unknown):
  { ok: true; signals: CaseSignalsV1 } | { ok: false; error: string } {
  const r = raw as { signal_version?: number } & Record<string, unknown>;
  if (r.signal_version === undefined) return { ok: false, error: "missing signal_version" };
  if (r.signal_version !== SIGNAL_CONTRACT_VERSION)
    return { ok: false, error: `unsupported signal major version ${r.signal_version}` };
  const s = r as unknown as CaseSignalsV1 & Record<string, unknown>;
  if (typeof s.case_id !== "string" || typeof s.risk_score !== "number")
    return { ok: false, error: "missing case_id/risk_score" };
  for (const k of ["doc_verification","country_tier"] as const)
    if (typeof s[k] !== "string") return { ok: false, error: `missing ${k}` };
  for (const k of ["watchlist_hits","tenure_days","velocity"] as const)
    if (typeof s[k] !== "number") return { ok: false, error: `missing ${k}` };
  if (!Array.isArray(s.ml_scores)) s.ml_scores = [];
  return { ok: true, signals: s };
}
