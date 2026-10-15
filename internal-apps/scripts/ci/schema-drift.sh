#!/usr/bin/env bash
# schema-drift — diff apps/*/db/migrations against the schema section of
# apps/*/docs/LLD.md. Schema truth lives ONLY in db/migrations; drift fails
# the build (docs contract §2).
set -euo pipefail
echo "schema-drift: NOT IMPLEMENTED — gate is red by design until the checker lands." >&2
exit 1
