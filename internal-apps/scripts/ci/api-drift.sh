#!/usr/bin/env bash
# api-drift — diff apps/*/openapi.yaml against implemented routes (api-drift.ts).
set -euo pipefail
exec pnpm exec tsx "$(dirname "$0")/api-drift.ts" "$@"
