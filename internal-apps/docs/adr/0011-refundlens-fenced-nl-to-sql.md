# ADR-0011 — RefundLens ask engine: generated NL→SQL behind the fence + AST

Status: accepted · Immutable once merged; amend by new ADR.

## Context

The press release promises an answer in <60s by asking, not ticket.
A deterministic NL→SQL module (templates + fenced generator in api/ask/)
powers the ask box; console views render typed params through the same
template library. C3 data, read-only posture, no LLM in the request
path.

## Options

- **(A) Generated SQL behind six fences + AST validation** — generator
  emits SQL; an AST parse (never regex) rejects DDL/DML and
  out-of-allowlist constructs; fences: read-only role, single-schema
  allowlist, mandatory LIMIT ≤5000, statement_timeout 5s, EXPLAIN cost
  cap >5000, banned tables (ask_log, sync_runs, non-refundlens schema).
- **(B) Canned templates only** — safest — but the ask box becomes a
  dropdown; users retreat to analyst tickets and the <60s answer promise
  dies as a form. The cost is the product.
- **(C) Unfenced generation** — rejected outright: a best-effort
  fallback turns a rejected query into a wrong answer or a write; the
  cost is unbounded on a regulated-adjacent dataset.

## Decision

A — generated SQL behind the fence; violations return
{error:{code:"fenced_query_rejected",...}} — never a best effort.

## Tradeoffs

Some legitimate questions get rejected — accepted, and METERED as a
product signal (fenced-rejection >25%/1h = ticket): extend templates or
the dims registry, never loosen the fence.

## Consequences

- AST validation, not regex — spelling variants cannot evade the parse.
- Client views never submit SQL; typed params only, rendered
  server-side through the same template library — a view is not a back
  door around the six fences.
- The fence table-driven unit matrix (mutation, DDL, cross-schema,
  no-LIMIT, over-cap cost, timeout) is a CI gate, not a suggestion.
