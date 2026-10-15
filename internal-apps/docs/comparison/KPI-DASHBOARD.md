# KPI dashboard — PR promises as quarterly KPIs

Measured quarterly per §7. Every KPI traces to a named press-release
promise, a decision (D#), or a falsifier — the program's promises are the
dashboard, not an afterthought. `metric` names the instrument; apps'
metric names follow the `<app>_<noun>_<unit>` rule (platform-observability).

| KPI | Target | Source / instrument | Serves |
|---|---|---|---|
| Queue clear-time | −40% vs baseline | fastlane queue metrics vs baseline capture | fastlane PR |
| FastLane queue latency | p95 <1s | `fastlane_queue_render_seconds` RED dashboard | fastlane PR |
| FastLane decisions audited | 100% | audit_events coverage — mutations with same-tx audit row | fastlane PR / AUDIT gate |
| Median time-to-answer | <60s | refundlens `ask_log` + filter session timing | refundlens PR |
| Flag flips with complete attribution | 100% | replica audit rows (demo metric — prod flags stay on PA) | flags PR |
| PR-approved→live | <3 weeks | intake gate timestamps → deploy | gate / all lanes |
| Engineering capacity on internal tools | <1.5% | eng-hours ledger vs loaded capacity | §2 cost model |
| Cost per shipped app | trending down | per-app build+run spend after scaffold amortization | D5 envelope |
| CRUD-class app from template | <1 day | template-smoke + app instantiation runs | template gate |
| Senior review turnaround | <48h | PR review timestamps (sustained, not bursts) | **D4 safety valve** |
| PR-promise-kept rate | >90% | promises passing acceptance tests at launch — the Amazon metric: did we ship what we wrote down, or what was convenient? | every PR |

## Rules of the dashboard

- A KPI with no instrument gets one before it is reported — "we'll
  measure later" is a rejected row.
- Missing two consecutive targets opens an entry in the owning app's
  OPEN-QUESTIONS with owner + trigger + date.
- Falsifier KPIs (review turnaround, ACU/app ratio) are wired to alerts,
  not just the quarterly read — the reversals in ROUTING-PLAYBOOK fire
  on evidence, not on sentiment.
