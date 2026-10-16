#!/usr/bin/env bash
# schema-drift — diff apps/*/db/migrations against the schema section of
# apps/*/docs/LLD.md. Schema truth lives ONLY in db/migrations; drift fails
# the build (docs contract §2). Implementation: schema-drift.ts.
set -euo pipefail
exec pnpm exec tsx "$(dirname "$0")/schema-drift.ts" "$@"
