#!/usr/bin/env bash
# adr-check — architectural diffs (DB, state machines, API shape, topology,
# platform/) must carry a new docs/adr/NNNN-slug.md (docs contract §4; adr-check.ts).
set -euo pipefail
exec pnpm exec tsx "$(dirname "$0")/adr-check.ts" "$@"
