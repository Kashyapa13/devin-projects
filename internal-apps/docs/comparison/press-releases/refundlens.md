# Press release — RefundLens

**RefundLens answers refund questions in under a minute.** Support and ops
leaders open a read-only console, filter by merchant, window, or reason —
or just ask — and get the number, the trend, and the raw events behind it.
No analyst ticket, no stale spreadsheet.

## The customer problem

Refund questions today route through an analyst who runs the same query
with different parameters and pastes a chart. Median time-to-answer is a
day; during that day the asker usually moves on and decides anyway.

## The solution

RefundLens is a read-only analytics console over a logical replica of the
refunds source. A scheduled sync loads raw events into `refund_events_raw`
and daily aggregates; a watermark fence guarantees the app can only ever
read, never write, the source. Two ways to an answer: filters over the
aggregates, or an ask box that turns a question into a logged, constrained
query (`ask_log` — usage is measured: if filters win and the ask box goes
unused, the conversational build dies and reporting consolidates in Power
BI — the falsifier is pre-committed).

## What customers get

- Median time-to-answer <60s (KPI).
- The same number twice — aggregates are computed once, consistently.
- Source safety by construction: read-only user, watermark fence, C3 data
  only, no cardholder fields.

## Internal FAQ

**Why not Power BI?** Power BI is the right lane for scheduled reporting;
RefundLens is the answering console — exploratory, sub-minute, keyboard-
first. The lanes are complementary: consolidations that prove they belong
in reporting move to PBI (the falsifier above enforces the honesty of that).

**Why not Power Apps?** An analytics replica with watermark sync, an ask
pipeline, and 99.9% read SLO is software, not a form. The comparison doc
maps this promise row-by-row (§1).

**Is the replica a real DB?** A logical database owned by RefundLens —
one app, one binding, migrations in the app, no shared store (root law).

**What kills it?** The falsifier above, or the 4-week source fork — both
are doors, documented in ROUTING-PLAYBOOK.
