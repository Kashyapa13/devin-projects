# ADR-0018 — RefundLens live tier: fence scopes, ops/service roles, beat auth

Status: accepted · Immutable once merged; amend by new ADR.

## Context

The dashboard retrofit (ADR-0019/0016) surfaced three facts the original
designs did not name:

1. **The fence's table law is path-shaped, not global.** ADR-0011 banned
   `sync_runs` and `ask_log` from the *ask path* — those are evidence and
   telemetry tables, and a NL-generated query must never read them. But
   server-rendered surfaces legitimately need what the ban denies:
   `monitors_panel` reads `monitors` + `monitor_events`, `sync_health`
   reads `sync_runs`, the heatmap reads `agg_hourly`. The fence as
   written made the widget surface impossible without weakening it.
2. **Two new callers exist.** The dashboard has a read-only ops
   population, and the heartbeat script is a machine caller that must
   authenticate as something other than a person.
3. **EventSource cannot send headers.** `EventSource` (the SSE client)
   has no `Authorization` support, so the heartbeat stream needed a
   credential path that is not a header — without minting a second auth
   system.

## Options

- **(A) Loosen the global allowlist** — let `sync_runs` etc. be queried
  by any fenced path. Cheapest diff, biggest blast radius: ask-generated
  SQL could then read telemetry + evidence tables, exactly what the ban
  exists to stop.
- **(B) Per-path fence scopes** — parameterize `validateSql` with a
  scope (allowlist + banned set); the ask path keeps the strict defaults,
  the widget path gets its own allowlist (`refund_events_raw`,
  `agg_daily`, `agg_hourly`, `monitors`, `monitor_events`, `sync_runs`)
  and still bans `ask_log` in every scope. All other fences (read-only
  role, LIMIT, timeout, cost cap, AST) apply unchanged to every scope.
- **(C) Separate query path for widgets** — rejected: "the SAME fenced
  aggregation layer" is the WIDGET LAW; a second executor is a second
  fence to audit.

For auth: **(D) cookie session for SSE** vs **(E) `?token=` carrying
the same HS256 session JWT verified by the same `app.session.verify`.**

## Decision

**(B) + (E).** `validateSql(sql, scope)` with `WIDGET_SCOPE` on the
widget route and `ASK_SCOPE` (the original defaults) everywhere the ask
path executes. `ask_log` stays banned in every scope — there is no
honest query surface for it. `rolesMatrix` gains two rows:

- `ops`: `["dashboard:read","sync:read"]` — the read-only operations
  viewer (dashboard widgets + SSE + health/sync).
- `service`: `["health:read","beat:write"]` — machine callers; only the
  heartbeat script posts beats.
- `analyst` also gains `dashboard:read` for the dashboard surfaces.

The SSE route accepts `Authorization: Bearer` (programmatic clients) or
`?token=<jwt>` (EventSource) — the SAME JWT verified by the same code
path; `?token=` is a transport workaround, not a second credential
scheme. `POST /api/internal/beat` is service-role only and is how the
heartbeat reaches the in-process beat registry that fans out to SSE
clients — a degraded beat is recorded and fanned out, never silent.

## Tradeoffs

- Two scopes mean two allowlists to reason about; a table added to the
  widget scope is deliberately readable by server-rendered SQL. The
  review burden is explicit per-scope, which is the point.
- `?token=` puts a JWT in URLs — it can land in proxy/browser logs. The
  token is the same short-lived session JWT the app already uses; the
  beat payload carries no data beyond freshness. Acceptable for the
  freshness surface; not a precedent for data endpoints.
- The beat registry is in-process: it lives as long as the API process.
  Cold starts fall back to a snapshot synthesized from `sync_runs` and
  are labeled `degraded` on the wire — honest, not silent.

## Consequences

- `WIDGET_SCOPE` is the only scope besides the ask default today; new
  scopes need an ADR or an explicit comment citing this one.
- Role additions stay additive (ADR-0009 law): a row per caller class,
  never a wildcard.
- If EventSource gains header support (or the app moves to fetch-based
  SSE), `?token=` should be retired — noted for the live-tier revisit.
