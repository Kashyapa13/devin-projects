#!/usr/bin/env bash
# adr-check — architectural diffs require a docs/adr/ file in the same PR
# (docs contract §4). Architectural = touching platform/, any app's
# db/migrations or api/, or .github/workflows.
set -euo pipefail
cd "$(dirname "$0")/../.."
base="${GITHUB_BASE_SHA:-origin/main}"
files=$(git diff --name-only "$base"...HEAD 2>/dev/null || git diff --name-only "$base" HEAD || git show --name-only --pretty='' HEAD)
arch=$(echo "$files" | grep -E 'platform/|db/migrations/|apps/[^/]+/api/|\.github/workflows/' || true)
[ -z "$arch" ] && { echo "adr-check: no architectural paths touched"; exit 0; }
adr=$(echo "$files" | grep -E 'docs/adr/[0-9]{4}-' || true)
if [ -z "$adr" ]; then
  echo "adr-check: architectural change without an ADR in this diff:" >&2
  echo "$arch" >&2
  exit 1
fi
echo "adr-check: ADR(s) present: $(echo "$adr" | tr '\n' ' ')"
