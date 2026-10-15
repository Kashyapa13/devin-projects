# THREAT-MODEL — top 5
1. **Silent threshold drift** → pack changes = ADR + writer review; stale-pack alert >90d.
2. **Unguessable signals** → versioned contract; unknown majors 400, never coerce.
3. **Kill-switch bypass** → decide path checks engine_state FIRST; engagement freezes in-flight for supervisor review.
4. **Audit gap** → every shadow decision row = inputs+version+rule+confidence; mirrored to FastLane audit (ADR-0018 contract).
5. **History-free tuning** → golden set frozen in CI; any silent flip = red build; OPEN-1 swaps in real ops history at 4 weeks.
