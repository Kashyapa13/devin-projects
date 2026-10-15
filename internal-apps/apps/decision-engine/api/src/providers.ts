import type { MlScore } from "./signals.js";

/** Real scoring service slots in later without rearchitecting (ADR-0015). */
export interface ModelScoreProvider {
  name: string;
  scoresFor(caseId: string): Promise<MlScore[]>;
}

/** Deterministic pilot values — clearly-labeled placeholder, NOT a model. */
export class MockModelScoreProvider implements ModelScoreProvider {
  name = "mock-v1";
  async scoresFor(caseId: string): Promise<MlScore[]> {
    // deterministic pseudo-score from the case id — stable across runs
    let h = 0;
    for (const c of caseId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return [{ model_name: "mock", model_version: "1.0.0",
      score: (h % 1000) / 1000, score_type: "placeholder" }];
  }
}
