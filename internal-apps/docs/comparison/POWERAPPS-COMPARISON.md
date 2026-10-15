# Power Apps vs the Devin lane — the comparison

Every number cites [FACTS.md](FACTS.md). Every Power Apps capability or
pricing claim cites a live Microsoft URL (the PV verifier fetches each
one). Program estimates are marked `[EST]` — they are our numbers, not
vendor claims. No vendor adjectives: both lanes' claims are stated at
their documented strength.

## §1 Capability mapping — per PR promise

| PR promise (named) | Power Apps | Devin lane | Power BI |
|---|---|---|---|
| fastlane: queue clear-time −40% | — | **Owns it** (keyboard console, queue p95 <1s) | — |
| fastlane: 100% decisions audited | partial (Dataverse audit logs exist, not same-tx envelope) | **Owns it** (same-tx audit rows by construction) | — |
| fastlane: C4 encrypted + masked-by-default | — (no app-layer AES-GCM + audited reveal) | **Owns it** | — |
| refundlens: median time-to-answer <60s | — | **Owns it** (filters + ask box on a replica) | scheduled reports only |
| refundlens: read-only source guarantee | — (connector permissions, not a fence) | **Owns it** (watermark fence) | — |
| flags: 100% flips attributed | **Owns it today** (stays on PA) | replica = capability demo | — |
| template: CRUD app green <1 day | maker builds unassisted (3–6 analyst-wks per FACTS [EST]) | **Owns it** (scaffold→green, zero edits) | — |
| forms/approvals on M365 data | **Owns it** | — | — |
| scheduled exec reporting | — | — | **Owns it** |

Every row traces to a named press-release promise or the template gate —
the matrix is the promises, not a feature checklist.

## §2 Cost model

Power Apps list pricing ([pricing page](https://www.microsoft.com/en-us/power-platform/products/power-apps/pricing),
[licensing FAQ](https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq)):
Premium $20/user/mo paid yearly; $12 at 2,000-seat minimum;
$22/$14 effective Jan 1 2027 ([price update notice](https://www.microsoft.com/en-us/licensing/news/power-apps-premium-price-update)).
Dataverse add-on $40/GB/mo. Per-app plan ended for new customers Jan 2026 ([end-of-sale notice](https://www.microsoft.com/en-us/licensing/news/power-app-per-app-end-of-sale)).

```
PA_annual(app)   = seats × $240  (+ Dataverse GB × $480)
Devin_annual(app)= build_cost + run + review_overhead
                  where build = 1–3 eng-wks × $4k + $50–500 agent [EST]
```

| Active users | PA Premium/yr | Devin-built (build+yr-1 run) [EST] |
|---|---|---|
| 100 | $24,000 | ~$8–16k one-time + ~$6k/yr run+review |
| 300 | $72,000 | same one-time + ~$8k/yr |
| 1,000 | $240,000 | same one-time + ~$12k/yr |

Crossover: PA wins where seats are few or the app is forms-shaped; the
Devin lane's cost is nearly user-count-flat, so every app that must
exist as software (audit envelope, custom UX, real test gates) crosses
over inside its first year — and per-seat cost falls to zero when the
2000-seat $12 tier is out of reach (which it is: see below).

### The licensing inference ($250k/yr — what it implies)

`$250k/yr ÷ $240 = ~1,041 Premium seats` — implausible for a 60-engineer
org unless nearly every employee in the company holds Premium. More
likely decompositions:

- **(a)** A few hundred Premium seats + most apps running on M365-seeded
  standard connectors + Dataverse capacity overages ($40/GB adds up fast).
- **(b)** Premium seats + Power Automate/other Power Platform spend billed
  in the same envelope.
- **(c)** Fewer seats at higher tier + environment/storage add-ons +
  partner/consulting spend coded to the same line.

The real decomposition is **OPEN-1: the license audit (D3)** — named
owner, 5 business days. Every scenario above changes the answer: (a) says
Devin lane expands (seats migrate to zero marginal cost); (c) says the
$250k line shrinks mostly by contract work, not by lane choice.

## §3 What Power Apps genuinely wins (full strength)

- **Zero-infra apps.** No deploys, no images, no on-call for the platform
  itself — Microsoft runs it ([managed environments](https://learn.microsoft.com/en-us/power-platform/admin/managed-environment-overview)).
- **Maker velocity on M365 data.** Forms, approvals, and data entry
  against SharePoint/Teams/Dataverse by analysts, not engineers — that is
  the lane's design point, with the built-in connector catalog (~1,000+ marketed; ~1,600 listed in the [connector reference](https://learn.microsoft.com/en-us/connectors/connector-reference)).
- **Bundled economics.** M365-seeded rights cover standard connectors;
  if the org already pays, marginal app cost can be ~$0 — the strongest
  honest argument for PA-primary on forms-shaped work.
- **Copilot authoring.** Copilot chat/form-fill GA for Dynamics 365 users;
  for standalone Power Apps these stay in public preview
  ([licensing FAQ](https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq)).
- **Compliance posture.** FedRAMP High GA ([FedRAMP audit scope](https://learn.microsoft.com/en-us/azure/azure-government/compliance/azure-services-in-fedramp-auditscope)).
- **Bus factor.** The maker community is larger than our platform team —
  a staffing argument that survives scrutiny.

## §4 What the Devin lane wins — by a mile

- **Engineering guarantees as code.** Same-tx audit envelopes, AES-256-GCM
  field encryption, object-level RBAC, state machines — verified by tests
  in CI, not by convention.
- **Real gates.** unit/integration/contract/e2e/axe/k6/rollback drills —
  the ship gate in PROD-READINESS-CHECKLIST is executable, not a wiki.
- **Cost shape.** One-time build vs per-seat forever (§2); platform
  amortizes across apps #2+.
- **No ceiling.** Unbounded UX, any datastore shape, k6 perf budgets —
  nothing in the connector catalog is a dependency.
- **Reviewable diff.** Every change is a git PR with tests and docs in
  one commit — the docs contract is mechanical.
- **Portability.** One OCI image per app; the lane has no lock-in of its
  own (exit reserve 0.5–1 FTE [EST]).

## §5 The honest middle

Between "obvious forms app" and "obvious software" sits a band where both
lanes work: simple CRUD on internal data, modest user counts, no
engineering-grade guarantees. In that band the tie-breakers are, in
order: (1) the seat math of §2 for the app's actual user count; (2)
whether the PR promise names a control only the Devin lane can enforce;
(3) which lane owner has capacity this quarter. The routing playbook
scores exactly these three.

## §6 What the verifier broke

**Status: STUB — completed after PV runs.** This section publishes every
claim in this document the independent verifier falsified, with its
resolution — no quiet edits, no memory-holing.

| Claim (as written above) | PV verdict | Resolution |
|---|---|---|
| _pending_ | _pending_ | _pending_ |

Rule: a falsified claim is re-stated correctly in place AND listed here;
if the verifier breaks a §3 row it strengthens to §4's ledger and vice
versa — fairness is maintained by publishing the correction, not by
never being wrong.
