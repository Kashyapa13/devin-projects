# ADR-0007 — FastLane KYC documents: 15-min signed URLs, never proxied

Status: accepted · Immutable once merged; amend by new ADR.

## Context

KYC doc objects are C4 (§3 field table). Reviewers need the doc in front
of them while deciding; the doc must never be plaintext in
logs/telemetry — and ideally never touch the app at all.

## Options

- **(A) S3 + 15-min signed URLs; API returns the URL, browser fetches
  bytes directly** — the app never becomes a C4 processor for bytes;
  exposure window is bounded and auditable (reveal/audit correlation).
- **(B) Proxy bytes through the API** — every stream is a C4 data-flow
  the app now owns (buffers, retries, crash dumps); zero user benefit,
  total audit surface: the cost is the entire threat model's #4 row.
- **(C) Long-lived/persistent URLs** — a forwarded link stays open
  forever; leakage is permanent, not 15 minutes.

## Decision

A — signed URLs at 15-min expiry; signer key in KMS (S3_SIGNER_KMS);
doc-url endpoint gated by RBAC + assignee.

## Tradeoffs

Long doc sessions need re-issue (UI re-fetches on expiry) — a UX hiccup
accepted against permanent leakage.

## Consequences

- THREAT-MODEL #4 mitigation chain: expiry + no-transit + KMS signer +
  reveal/audit correlation.
- Any requirement needing longer sessions = new ADR, not a raised TTL.
