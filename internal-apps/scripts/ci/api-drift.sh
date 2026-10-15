#!/usr/bin/env bash
# api-drift — regenerate each app's openapi.yaml from its TypeBox route
# registry and fail if the committed file differs (docs contract §3).
set -euo pipefail
cd "$(dirname "$0")/../.."
fail=0
for appdir in apps/*/; do
  app=$(basename "$appdir")
  case "$app" in _template|_smoke_run) continue;; esac
  [ -f "$appdir"api/src/openapi.ts ] || continue
  pkg="@app/$app"
  echo "api-drift: regenerating $pkg openapi.yaml"
  pnpm --filter "$pkg" openapi >/dev/null
  if ! git diff --exit-code --quiet -- "$appdir"openapi.yaml; then
    echo "api-drift: $app openapi.yaml drifted — commit the regenerated file."
    fail=1
  else
    echo "api-drift: $app clean"
  fi
done
exit $fail
