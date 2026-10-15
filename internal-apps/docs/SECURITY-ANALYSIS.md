# SECURITY-ANALYSIS — recorded security battery (TESTING.md §SECURITY)

Method: adversarial ATTEMPTS on a clean checkout + live stack, not code-reading
assertions. Independent verifier session ran every row below twice — once on
`c1a55e8` (found 4 breaches), once on `ad83eb4` post-fix (all re-verified held).
FastLane executor's test PR adds the same checks as permanent tests.

## Tool battery

| Tool | Scope | Result |
|---|---|---|
| `gitleaks detect --source . --all --redact` | full history (99 commits) | clean, no leaks |
| `pnpm audit --prod` | prod deps | 1 moderate: `uuid` via testcontainers→dockerode (dev chain only) → filed P2 |
| `pnpm audit` (dev incl.) | all deps | 3 dev-chain vulns → filed P2 (owner+date in OPEN-QUESTIONS) |
| `pnpm license-check` | 484 external packages | allowlist clean |
| Trivy image scan | app Dockerfiles | CI `security-trivy` job green on every PR |
| semgrep (auth/audit/crypto/fence/platform) | static analysis | folded into the executor test suites' static checks — clean |

## RBAC / auth battery (all executed over HTTP)

- Unauthenticated on every FastLane route → 401 (cron → 403 by design);
  `/metrics` 200, aggregates only, no PII labels.
- Wrong-role matrix (auditor/analyst/service/viewer on mutations; admin on
  claim; reviewer on audit) → 403 everywhere required.
- JWT forgery: wrong secret, `alg:none`, tampered payload, expired, wrong
  issuer, cross-app token reuse → all 401.
- Illegal transitions incl. APPROVED→*, non-assignee approve, short/missing
  reason, supervisor-only edge as reviewer, stale `expected_version`,
  missing/short Idempotency-Key → denied with correct codes.
- Concurrent double-claim race (21 pairs) → no double-200, no dup audit rows.
- Export route bypass (unauth/ops/service/admin/agent) → 401/403; analyst
  gets CSV with watermark header + exact-count footer.
- Injection corpus (SQLi in tab/cursor/limit/:id/note-body, XSS in note,
  path traversal) → parameterized/escaped/clamped; worst case generic 500
  with no data leak (P1 follow-up: should be 400/404).
- C4 at rest → ciphertext envelope only; masked column lists on reads.

## Fence escape corpus (RefundLens /ask + validateSql)

Banned tables (ask_log/sync_runs) direct + subquery + quoted/case-mixed →
`banned_table`; 2nd-JOIN escape → `banned_table`; UNION/multi-statement/
CTE-write/SELECT INTO/FOR UPDATE → `mutation`; no-LIMIT → `no_limit`;
over-cap → `limit_over_cap`; cross-schema (pg_catalog, public.users,
information_schema) → `cross_schema`. All bodies `{error:{code:
fenced_query_rejected}}`.

## Round 1 breaches (c1a55e8) → Round 2 re-verification (ad83eb4)

| # | Breach | Fix | Re-verified |
|---|---|---|---|
| B1 | `audit_events` UPDATE/DELETE/rewrite as app's superuser DSN | migration 0002 `fastlane_app` role (INSERT-only on audit) + API binds `fastlane_app_dev` login | `permission denied` on UPDATE/DELETE/TRUNCATE/DROP |
| B2 | `pg_read_file`/`pg_ls_dir`/`pg_sleep` passed the fence and executed | family ban: all `pg_*`/`dblink*`/`lo_*`/`query_to_xml*` identifiers rejected | 28-case evasion battery (case, quote, comment-splice, dollar-quote, schema-qual, nested, EXISTS) — all rejected |
| B3 | app connected as `postgres` superuser (read-only-role law absent) | `*_app_dev` LOGIN roles IN ROLE the NOLOGIN groups; `pg_stat_activity` shows zero superuser conns | `rolsuper=f`; direct `pg_read_file` → `permission denied for function` (DB-layer backstop under the fence) |
| B4 | idempotent `/reveal` replay re-disclosed C4 with no new audit row | reveal runs `cache:false` — every call re-executes and writes its own audit row | 3 replays → 3 `case.reveal` rows |

## THREAT-MODEL top-5 → passing tests/executed checks

| Threat | Mitigation | Proof |
|---|---|---|
| Audit tampering | insert-only app role + same-tx audit writer | R5 (permission denied) + append-only test |
| C4 disclosure without audit | audit-before-return + no-replay reveal | R4 + reveal kill-test |
| SQL injection / fence escape | AST fence + family bans + bound params | R1–R3 + 25-input corpus |
| Auth bypass | server-side RBAC + JWT verify (no alg confusion) | forgery battery rows 1–4 |
| Rate-limit abuse | per-user buckets | 429 boundary probes |

## Residuals (tracked, not breaches)

- `current_setting`/`version()`/`to_regclass` pass fence validation —
  metadata only, no table exfil. Watched.
- `'pg_x'` inside a string literal → rejected (conservative false-positive —
  safe direction).
- `doc-url` writes an audit row for nonexistent case ids (no existence check)
  — filed.
- Malformed cursor/limit/:id → generic 500 instead of 400/404 — fixed in
  fastlane testing PR (#18).
- `uuid` moderate vuln (dev chain) — P2 filed.
- `pool.query`-per-call `SET statement_timeout` — works (8×pg_sleep(7) all
  killed ~5030ms) but fragile on conn recycling — follow-up: pin via
  `pool.connect()`.
- Flags/decision-engine surfaces were absent on the audited ref; they get
  this same battery at their stack tips.
