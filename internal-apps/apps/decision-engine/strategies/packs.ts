/** SEED STRATEGY PACKS — starting vocabulary (ADR-0018).
    Thresholds are TUNE-ME placeholders the strategy writer (Vaibhav)
    calibrates from shadow history. Threshold change = PR + writer review;
    pack change = ADR. A pack stale >90d → stale-pack alert. */
export const STRATEGY_WRITER = "Vaibhav";

export type Decision = "APPROVE" | "IN_REVIEW" | "ESCALATE";

export interface Rule { id: string; when: (s: Sig) => boolean; decide: Decision; reason: string; confidence: number; }
export interface Sig { risk_score: number; doc_verification: string; country_tier: string;
  watchlist_hits: number; tenure_days: number; velocity: number; }
export interface Pack { id: string; version: string; rules: Rule[]; updatedAt: string }

/* TUNE-ME thresholds — calibrate from the app's own shadow history. */
export const TUNE = {
  lowRiskScore: 25,      // approve-candidate band ceiling
  highRiskScore: 70,     // escalate floor
  tenureDays: 180,       // approve-candidate minimum tenure
  velocityDays: 30,      // velocity-anomaly tenure window
  velocityRate: 5,       // velocity-anomaly tx/day floor
} as const;

export const packs: Pack[] = [
  { id: "high-risk-escalate", version: "1.0.0", updatedAt: "2026-10-15", rules: [
      { id: "esc.watchlist", when: (s) => s.watchlist_hits > 0,
        decide: "ESCALATE", reason: "WATCHLIST_HIT", confidence: 0.95 },
      { id: "esc.risk", when: (s) => s.risk_score >= TUNE.highRiskScore,
        decide: "ESCALATE", reason: "HIGH_RISK", confidence: 0.9 } ] },
  { id: "doc-anomaly-review", version: "1.0.0", updatedAt: "2026-10-15", rules: [
      { id: "doc.anomaly", when: (s) => s.doc_verification === "MISMATCH" || s.doc_verification === "UNSUPPORTED",
        decide: "IN_REVIEW", reason: "DOC_ISSUE", confidence: 0.85 } ] },
  { id: "velocity-anomaly-review", version: "1.0.0", updatedAt: "2026-10-15", rules: [
      { id: "vel.young-fast", when: (s) => s.tenure_days < TUNE.velocityDays && s.velocity >= TUNE.velocityRate,
        decide: "IN_REVIEW", reason: "VELOCITY_ANOMALY", confidence: 0.8 } ] },
  { id: "low-risk-approve-candidate", version: "1.0.0", updatedAt: "2026-10-15", rules: [
      { id: "ok.low-risk", when: (s) =>
          s.risk_score < TUNE.lowRiskScore && s.doc_verification === "PASS" &&
          s.country_tier === "T1" && s.watchlist_hits === 0 && s.tenure_days > TUNE.tenureDays,
        decide: "APPROVE", reason: "LOW_RISK_CLEAN", confidence: 0.9 } ] },
  { id: "default-to-human", version: "1.0.0", updatedAt: "2026-10-15", rules: [
      { id: "def.catchall", when: () => true,        // the catch-all IS a strategy, never an accident
        decide: "IN_REVIEW", reason: "DEFAULT_HUMAN", confidence: 1.0 } ] },
];
/* DECLARED precedence = array order: escalate > anomaly > approve > default. First-match wins. */
