# Press release — Flags (stay-put decision + capability demo)

**Flags keeps feature-flag changes fast and attributable — without
switching platforms.** The production flags panel stays on Power Apps.
What changes: every flag flip now carries who/when/what-changed
attribution in one place, and a Devin-built replica of the panel exists as
a standing capability comparison — same UX, same flows, different lane.

## The customer problem

The Power Apps flags panel works; it is not broken. What it lacks is a
defensible answer to "would we build this here if we were choosing
today?" — and a cheap, reversible path if the answer changes.

## The solution

Two pieces, both documented (§3.4, ADR-0002):

1. **Stay put.** Production flags remain on the Power Apps panel — the
   pragmatic call while the license audit (D3) is outstanding.
2. **Prove the replica.** A Devin-built panel reproduces the workflow:
   list → flip → confirm → attributed audit row. The replica is the
   capability demo and the comparison instrument — its run cost and
   capability deltas are measured, not argued.

The exit design stays dormant but real: trigger conditions are written
down (falsifier #4) — the replica demonstrates a clear capability/run-cost
advantage AND the license audit shows Premium spend growth → the shim
migrates flags to the exit design, accepting SDK + 99.95%-SLA ownership.

## What customers get

- Flag flips with complete attribution: 100% (replica demo metric;
  production flags remain on Power Apps).
- A priced exit that costs nothing until the trigger fires.
- An honest answer to "which lane should own this class of app," measured
  on a real app instead of a slide.

## Internal FAQ

**Why keep it on Power Apps?** It works, the team knows it, and the
decision is a two-way door — the replica + trigger define the reverse
path with no vendor in scope (§7 door map).

**What would flip it?** The falsifier above — evidence, not taste.

**Isn't the replica duplicated work?** It is the cheapest capability
instrument in the program: one app, already scaffolded from _template,
that turns lane debates into measurements.
