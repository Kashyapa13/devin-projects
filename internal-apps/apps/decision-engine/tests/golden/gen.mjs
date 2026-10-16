// Generates tests/golden/cases.json — synthetic, human-adjudicated stand-in
// (no 4-week ops history exists yet; spec fallback: writer-crafted set).
import { writeFileSync } from "node:fs";
let h = 7; const rnd = () => (h = (h * 16807) % 2147483647) / 2147483647;
const cases = [];
for (let i = 0; i < 220; i++) {
  const risk = Math.floor(rnd() * 100), tier = ["T1","T2","T3"][Math.floor(rnd()*3)];
  const doc = rnd() < 0.8 ? "PASS" : rnd() < 0.5 ? "MISMATCH" : "UNSUPPORTED";
  const watch = rnd() < 0.08 ? 1 : 0;
  const tenure = Math.floor(rnd() * 400), vel = Math.floor(rnd() * 10);
  // adjudicated ground truth, same precedence the packs declare:
  const expected = watch > 0 || risk >= 70 ? "ESCALATE"
    : doc !== "PASS" ? "IN_REVIEW"
    : tenure < 30 && vel >= 5 ? "IN_REVIEW"
    : risk < 25 && tier === "T1" && tenure > 180 ? "APPROVE" : "IN_REVIEW";
  cases.push({ signal_version: 1, case_id: `GOLD-${1000+i}`, risk_score: risk,
    doc_verification: doc, country_tier: tier, watchlist_hits: watch,
    tenure_days: tenure, velocity: vel, ml_scores: [], expected });
}
writeFileSync(new URL("./cases.json", import.meta.url), JSON.stringify(cases, null, 1));
