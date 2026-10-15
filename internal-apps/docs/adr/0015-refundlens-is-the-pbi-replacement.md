# ADR-0015 — RefundLens is the Power BI replacement for refunds reporting

Date: 2026-10-15 · Status: decided · Owner: refundlens owner (D7 Devin lane)

## Context

The client is replacing Power BI usage with Devin-built tools; RefundLens
must therefore stand on its own as a BI-grade dashboard — a sloppy console
would invalidate the replacement claim. The prior fork (conversational
console vs consolidate-in-PBI, OPEN-QUESTIONS `#conversational-vs-pbi`) is
CLOSED for this domain.

## Options

- **Chosen:** RefundLens = the Power BI replacement for refunds reporting,
  built to the Datadog/BI-grade widget bar in §4.2. The ask box remains ONE
  instrumented feature (its own keep/retire fork at 4 weeks), not the
  app's identity. Every widget runs on the SAME fenced server-side
  aggregation layer — the BI bar buys ZERO fence exceptions. The Power BI
  lane in the routing playbook remains available for OTHER future apps;
  generalizing this replacement beyond refunds is a later ADR on
  RefundLens adoption evidence.
- **Rejected:** keep RefundLens a thin answer console and leave BI in
  Power BI — the replacement claim dies at the demo; a half-committed
  console invalidates the whole lane-D argument.
- **Rejected:** consolidate refunds reporting into Power BI wholesale —
  repeats the licensing/exit problem this program exists to solve.

## Tradeoffs

- BI-grade widgets multiply the feature surface (~8–10 widget-group
  entries in the Feature Catalog — one FB session each).
- Every widget must stay fenced — no chart gets a bespoke SQL path; the
  aggregation layer carries the load.
- Live freshness becomes required, not optional (drives ADR-0016).

## Consequences

- The `/dashboard` surface is the app's identity; `/ask` is one
  instrumented feature with its own dated fork.
- The fence, watermark, and read-only laws are untouched — the BI bar
  buys ZERO exceptions.
- OPEN-1 closes for the domain fork; the ask-box keep/retire evaluation
  remains open as its own dated entry.
