#!/usr/bin/env bash
# schema-drift — diff apps/*/db/migrations against the schema section of
# apps/*/docs/LLD.md. Schema truth lives ONLY in db/migrations; drift fails
# the build (docs contract §2).
set -euo pipefail
cd "$(dirname "$0")/../.."
fail=0
for appdir in apps/*/; do
  app=$(basename "$appdir")
  case "$app" in _template|_smoke_run) continue;; esac
  mig=$(ls "$appdir"db/migrations/*.up.sql 2>/dev/null || true)
  lld="$appdir"docs/LLD.md
  [ -z "$mig" ] && continue            # docs-only app, nothing to check
  [ ! -f "$lld" ] && { echo "schema-drift: $app has migrations but no docs/LLD.md"; fail=1; continue; }
  mig_tables=$(grep -ioE 'create table (if not exists )?[a-z_]+' $mig | awk '{print $NF}' | sort -u)
  lld_tables=$(awk '/^```sql$/{f=1;next} /^```$/{f=0} f' "$lld" | grep -ioE 'create table (if not exists )?[a-z_]+' | awk '{print $NF}' | sort -u || true)
  if [ "$mig_tables" != "$lld_tables" ]; then
    echo "schema-drift: $app drifted"
    echo "  migrations: $mig_tables"
    echo "  LLD:        ${lld_tables:-<none found in sql fenced blocks>}"
    fail=1
  else
    echo "schema-drift: $app clean ($(echo "$mig_tables" | tr '\n' ' '))"
  fi
done
exit $fail
