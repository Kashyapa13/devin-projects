# FACTS — lane comparison source material

## Power Apps (microsoft.com + learn.microsoft.com)

- Premium $20/user/mo paid yearly; $12 at 2,000-seat min
  ([pricing](https://www.microsoft.com/en-us/power-platform/products/power-apps/pricing),
  [licensing FAQ](https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq))
- Per-app plan sales to new customers ENDED Jan 2 2026
  ([end-of-sale notice](https://www.microsoft.com/en-us/licensing/news/power-app-per-app-end-of-sale))
- Dataverse add-on $40/GB/mo
  ([capacity model](https://learn.microsoft.com/en-us/power-platform/admin/capacity-storage);
  price per Power Platform Licensing Guide Aug-2024, SKU CFQ7TTC0LHRL-2-P1Y)
- Dev Plan free (3 envs, 2GB, 750 flows/mo)
  ([pricing](https://www.microsoft.com/en-us/power-platform/products/power-apps/pricing))
- Canvas apps reach the built-in connector catalog (~1,000+ marketed, ~1,600
  listed — earlier "200+" figure stale); M365 seeded rights = standard
  connectors only (per the Licensing Guide; the two links list the catalog,
  not the entitlement split)
  ([connector reference](https://learn.microsoft.com/en-us/connectors/connector-reference),
  [licensing FAQ](https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq))
- M365 Copilot chat GA model-driven / preview canvas
  ([licensing FAQ](https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq))
- Agentic features model-driven only
  ([licensing FAQ](https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq))
- Vibe/Plans app-building preview, US/AU/Asia/India + English only, moving
  into Copilot Studio/Copilot Cowork
  ([vibe overview](https://learn.microsoft.com/en-us/power-apps/vibe/overview))
- Managed Environments included with standalone licenses
  ([managed environments](https://learn.microsoft.com/en-us/power-platform/admin/managed-environment-overview))
- FedRAMP High GA
  ([FedRAMP audit scope](https://learn.microsoft.com/en-us/azure/azure-government/compliance/azure-services-in-fedramp-auditscope))

## Devin (cognition.ai + docs.devin.ai)

Vendor-reported figures are labeled `[vendor]` — use them as Cognition-reported,
not independent measurements.

- 67% PR merge rate (vs 34% yr prior), 4x faster, 2x more efficient
  `[vendor]` ([cognition.ai](https://www.cognition.ai/blog))
- Migrations 10x (bank ETL) / 14x (Java) `[vendor]` (no public page located)
- Vuln remediation 1.5 min vs 30 min human (20x) `[vendor]` (no public page located)
- Coverage lifts 50–60% → 80–90% `[vendor]` (no public page located)
- ~⅓ of commits on Cognition's own web app `[vendor]` (CEO-cited figure differs
  ~89% of all commits; treat as unconfirmed)
- Fusion harness ≈$1.35/task vs $10.53 frontier-solo (FrontierCode 8/7/26 data)
  `[vendor]` (leaderboard not publicly fetchable)
- SWE-2 50.0% FrontierCode 1.1 Main `[vendor]` (matches public leaderboard ~Sept 2026)
- SOC 2 Type II since Sept 2024 ([trust center](https://trust.cognition.ai))
- ISO 27001:2022 ([trust center](https://trust.cognition.ai))
- FedRAMP High In-Process (Class D) ([trust center](https://trust.cognition.ai))
- RTO 48h ([security page](https://www.cognition.ai/security))
- Enterprise no-training without written consent
  ([security page](https://www.cognition.ai/security))
- AI Productivity Guarantee credits up to $10M `[vendor]` (announcement on
  [cognition.ai](https://www.cognition.ai/blog))
- No ACU burn while sleeping (30-min idle default) ([docs.devin.ai](https://docs.devin.ai))
- AGENTS.md auto-injection limit 16 KiB ([docs.devin.ai](https://docs.devin.ai))
- App deploys to devinapps.com (static) / Fly.io (FastAPI)
  ([docs.devin.ai](https://docs.devin.ai))
- Self-serve plans restructured Apr 2026 `[vendor]` ([cognition.ai](https://www.cognition.ai/blog))

## Program estimates

NOT vendor facts — label `[EST]` wherever used:

- Engineer $200k/yr loaded (≈$4k/wk)
- Analyst $100k/yr (≈$2k/wk)
- Devin-built app 1–3 eng-weeks incl. review + $50–500 agent spend
- PA app 3–6 analyst-weeks
- Steady-state portfolio $210–340k/yr (~60% eng time)
- Exit reserve 0.5–1 FTE
- Pilot envelope $25–40k
