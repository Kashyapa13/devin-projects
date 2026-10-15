# ADR-0012 — RefundLens fork: console-first build, instrumented ask box, evidence-gated

Status: accepted · Immutable once merged; amend by new ADR.

## Context

ROUTING-PLAYBOOK classifies the RefundLens fork — console+filters vs
conversational ask box — as a two-way door decided by teams, fast.
Building both to compare is expensive; pre-judging either way writes
off a lane on a guess. ask_log exists to make the comparison measurable.

## Options

- **(A) Ship console-first with the ask box instrumented** — both paths
  live; `scripts/fork_report.ts` weekly splits sessions ask-vs-filter
  from ask_log; at 4 weeks post-GA, ask-box <20% of sessions → draft
  the retirement ADR, notify the owner in the PR.
- **(B) Pre-judge: filters only** — cheaper — but the conversational
  question stays unanswered and gets re-litigated; the cost is a
  decision made on argument instead of evidence.
- **(C) Pre-judge: ask box only** — bets the lane on adoption of the
  riskiest component before the fence proves itself; the cost is a
  dead conversational layer discovered late, or a forced rebuild.

## Decision

A — console-first; the fork is evidence-gated, not opinion-gated.

## Tradeoffs

We ship and maintain the instrumented ask box for at least the
measurement window — cost accepted as the price of a reversible
decision that stays reversible on evidence, not vibes.

## Consequences

- OPEN-1 #conversational-vs-pbi owns the dated trigger (owner: refundlens
  owner; threshold: <20% at week 4; evidence: fork_report over ask_log).
- Before the date, ask_log + the report + instrumentation are
  untouchable — removing evidence early = pre-judging the fork =
  STOP-condition (AGENTS §9).
- On retirement: conversational layer removed, reporting consolidates
  in Power BI — executed by a new ADR, not by quiet deletion.
