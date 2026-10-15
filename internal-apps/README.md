# internal-apps

Internal tools program — the Devin-built lane. Power Apps (forms) and Power BI
(reporting) live outside this repo; commodities are bought, never built.
See `AGENTS.md` for the root constitution.

## Index

- Constitution — [AGENTS.md](AGENTS.md)
- Decisions — [docs/adr/](docs/adr/): [0001 three-lane routing](docs/adr/0001-three-lane-routing.md) · [0002 flags stay-put](docs/adr/0002-flags-stay-on-power-apps.md)
- Lane facts — [docs/comparison/FACTS.md](docs/comparison/FACTS.md)
- Ship gate — [docs/security/PROD-READINESS-CHECKLIST.md](docs/security/PROD-READINESS-CHECKLIST.md)
- Environments — [infra/ENVIRONMENTS.md](infra/ENVIRONMENTS.md)
- Program — [docs/program/ROLES.md](docs/program/ROLES.md) · [docs/program/ONCALL.md](docs/program/ONCALL.md)
- VP demo — [docs/site/](docs/site/)

## Apps

| App | Tier | Data class | SLO | Status |
| --- | --- | --- | --- | --- |
| `apps/fastlane` | Tier-1 | C4 | 99.9% | skeleton |
| `apps/refundlens` | Tier-2 | C3 | 99.5% | skeleton |
| `apps/flags` | — | — | — | procurement artifact: no build, no deploy |

New app = `cp -r apps/_template apps/<name>` — see `.devin/skills/app-building`.
<!-- gate proof -->
