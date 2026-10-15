/** case_signals v1 — versioned contract (ADR-0015). Unknown major versions
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

const DOC = ["PASS", "MISMATCH", "UNSUPPORTED", "PENDING"];
const TIER = ["T1", "T2", "T3"];

export function parseSignals(raw: unknown):
  { ok: true; signals: CaseSignalsV1 } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return { ok: false, error: "body must be a signals object" };
  const r = raw as { signal_version?: number } & Record<string, unknown>;
  if (r.signal_version === undefined) return { ok: false, error: "missing signal_version" };
  if (r.signal_version !== SIGNAL_CONTRACT_VERSION)
    return { ok: false, error: `unsupported signal major version ${r.signal_version}` };
  if (typeof r.case_id !== "string" || !r.case_id)
    return { ok: false, error: "missing case_id" };
  if (typeof r.risk_score !== "number" || !(r.risk_score >= 0 && r.risk_score <= 100))
    return { ok: false, error: "risk_score must be a number in [0,100]" };
  if (typeof r.doc_verification !== "string" || !DOC.includes(r.doc_verification))
    return { ok: false, error: `doc_verification must be one of ${DOC.join(",")}` };
  if (typeof r.country_tier !== "string" || !TIER.includes(r.country_tier))
    return { ok: false, error: `country_tier must be one of ${TIER.join(",")}` };
  for (const k of ["watchlist_hits", "tenure_days", "velocity"] as const) {
    const v = r[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
      return { ok: false, error: `${k} must be a non-negative number` };
  }
  const ml = r.ml_scores;
  const ml_scores: MlScore[] = Array.isArray(ml) ? ml.filter((m) =>
    m && typeof m.model_name === "string" && typeof m.model_version === "string" &&
    typeof m.score === "number" && typeof m.score_type === "string") : [];
  // whitelist — unknown fields are dropped, never stored (C4 cannot leak in)
  return { ok: true, signals: {
    case_id: r.case_id, risk_score: r.risk_score,
    doc_verification: r.doc_verification as CaseSignalsV1["doc_verification"],
    country_tier: r.country_tier as CaseSignalsV1["country_tier"],
    watchlist_hits: r.watchlist_hits as number,
    tenure_days: r.tenure_days as number,
    velocity: r.velocity as number, ml_scores } };
}
