#!/usr/bin/env bash
# docs-lint — enforce the docs contract: behavior-changing PRs update the
# matching doc section in the SAME PR (docs contract §3; docs-lint.ts).
set -euo pipefail
exec pnpm exec tsx "$(dirname "$0")/docs-lint.ts" "$@"
