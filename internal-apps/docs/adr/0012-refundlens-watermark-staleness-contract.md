# ADR-0012 — RefundLens staleness contract: watermark on every surface

Status: accepted · Immutable once merged; amend by new ADR.

## Context

ADR-0010 accepts up to an hour of designed staleness. The app's only
honesty mechanism is the sync watermark — a user must always know how
old the number they're reading is. Press release: "the same number
twice", which breaks silently if staleness is hidden.

## Options

- **(A) Watermark mandatory on every surface** — every answer envelope
  {answer, sql, rows, watermark, took_ms}; CSV exports carry it in a
  header comment; /health/sync exposes watermark + lag; amber banner on
  all pages at lag >90m; absent watermark = P1 bug.
- **(B) Watermark on the dashboard only** — cheaper — but exports and
  shared links escape with no freshness truth; the cost is silently
  wrong numbers in exactly the artifacts people forward.
- **(C) No watermark, rely on freshness SLO** — the cost is that a
  broken ETL is indistinguishable from fresh data: the worst failure
  mode for a decision-support tool.

## Decision

A — watermark on every surface including the CSV header comment.

## Tradeoffs

Every renderer/exporter must thread the field through — plumbing cost
accepted; the alternative re-buys the honesty problem in each surface.

## Consequences

- Cache: 60s TTL keyed by normalized-SQL hash; hits return the
  identical envelope with took_ms = cache_ms. Exports bypass cache —
  exact counts only, never estimates.
- Lag alerts: sync_lag_s >5400s ticket, >10800s page; banner law is
  automatic, not opt-in.
- Watermark propagation (store → envelope → CSV header) is an
  integration assertion in the LLD test matrix.
