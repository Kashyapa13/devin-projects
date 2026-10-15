#!/usr/bin/env bash
# docs-lint — the docs contract, cheap edition: every live app carries a
# non-empty AGENTS.md plus its design docs (HLD/LLD/OPEN-QUESTIONS for
# normal apps; flags is exempt per ADR-0002 — it keeps stay-decision,
# demo-spec, exit-design instead). Templates and doc-only PR skeletons
# may contain TODO markers; RUNBOOK skeletons are allowed.
set -euo pipefail
cd "$(dirname "$0")/../.."
fail=0
for appdir in apps/*/; do
  app=$(basename "$appdir")
  case "$app" in _template|_smoke_run) continue;; esac
  if [ ! -s "$appdir"AGENTS.md ]; then
    echo "docs-lint: $app missing or empty AGENTS.md"; fail=1
  fi
  if [ "$app" = "flags" ]; then
    for f in docs/stay-decision.md docs/demo-spec.md docs/exit-design.md; do
      [ -s "$appdir$f" ] || { echo "docs-lint: flags missing or empty $f"; fail=1; }
    done
    continue
  fi
  for f in docs/HLD.md docs/LLD.md docs/OPEN-QUESTIONS.md; do
    [ -s "$appdir$f" ] || { echo "docs-lint: $app missing or empty $f"; fail=1; }
  done
done
[ $fail -eq 0 ] && echo "docs-lint: clean"
exit $fail
