# Branch protection — `main`

Workflows without required checks are theater. Protection lives on the
PARENT repo (`Kashyapa13/devin-projects`) — apply once, with a token that
has repo-admin (`Administration: write` on fine-grained PATs / the repo
owner in the UI). Devin's session token lacks that scope, so this file is
the executable spec.

## One-shot (`gh`)

```bash
gh api -X PUT repos/Kashyapa13/devin-projects/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "lint", "typecheck", "unit", "build",
      "ft-unit", "ft",
      "drift-schema", "drift-api", "drift-docs", "drift-adr",
      "security-gitleaks", "security-audit", "security-trivy", "security-license",
      "semantics", "template-smoke"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON
```

## The same settings in the UI

Settings → Branches → Add rule for `main`:

- Require a pull request before merging — approvals: **1**, dismiss stale
  on push, require last-push approval: off
- Require status checks to pass — **require branches to be up to date**;
  contexts listed above
- Require conversation resolution before merging: **on**
- Include administrators (enforce_admins): **on** — the gates are the
  gates for everyone; an admin bypass is a "temporary" fence bypass
- Allow force pushes / deletions: **off**

## Why these contexts

| Context | Workflow·job | Failure = blocked merge |
|---|---|---|
| lint, typecheck, unit, build | `ci.yml` needs-chain, `turbo --affected` | lint/type error, red unit test, broken build |
| ft-unit, ft | `ft.yml` unit + per-app Playwright matrix (aggregated to `ft`) | broken functional path; artifacts uploaded |
| drift-schema, drift-api, drift-docs, drift-adr | `drift.yml` | migration w/o LLD, OpenAPI↔code/LLD drift, behavior change w/o docs, platform change w/o ADR |
| security-gitleaks, security-audit, security-trivy, security-license | `security.yml` (never filtered) | secret, high/critical vuln, image CVE, denylisted license |
| semantics | `semantics.yml` | non-conventional title/scope, missing PR-promise |
| template-smoke | `template-smoke.yml` | `_template` no longer instantiates green |

`ft` is the aggregate job — per-app contexts like `ft (fastlane)` are NOT
required: a matrix row must be free to skip when its app is unaffected,
and required contexts that never report would deadlock the merge.

## Verify

```bash
gh api repos/Kashyapa13/devin-projects/branches/main/protection \
  --jq '{checks: .required_status_checks.contexts, strict: .required_status_checks.strict, reviews: .required_pull_request_reviews.required_approving_review_count, threads: .required_conversation_resolution.enabled}'
```
