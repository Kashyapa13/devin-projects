#!/usr/bin/env bash
# render-deploy — bake platform k8s templates into apps/<app>/deploy/.
#   ./scripts/render-deploy.sh fastlane
#   NAMESPACE=staging REVISION=$(git rev-parse --short HEAD) ./scripts/render-deploy.sh refundlens
# Rendered manifests are committed (GitOps-reviewable diffs). Vars are
# documented in platform/packages/deploy/k8s/README.md.
set -euo pipefail
cd "$(dirname "$0")/.."

APP="${1:?usage: render-deploy.sh <app>}"
TPL="platform/packages/deploy/k8s"
OUT="apps/$APP/deploy"
[ -d "apps/$APP" ] || { echo "no such app: $APP" >&2; exit 1; }

export APP
export NAMESPACE="${NAMESPACE:-internal-apps}"
export REVISION="${REVISION:-latest}"
export IMAGE="${IMAGE:-registry.internal/${APP}:${REVISION}}"
export PORT="${PORT:-8080}"
export REPLICAS="${REPLICAS:-2}"
export MIN_REPLICAS="${MIN_REPLICAS:-2}"
export MAX_REPLICAS="${MAX_REPLICAS:-4}"
export DB_CIDR="${DB_CIDR:-10.0.0.0/8}"

# Compiled entry points differ by tsconfig rootDir: "api/src" emits flat
# dist/, "." emits dist/api/src/. The image CMD and migrate job must match.
ROOTDIR="$(grep -o '"rootDir": *"[^"]*"' "apps/$APP/tsconfig.build.json" | cut -d'"' -f4)"
if [ "$ROOTDIR" = "." ]; then
  export SERVER_ENTRY="${SERVER_ENTRY:-dist/api/src/server.js}"
  export MIGRATE_ENTRY="${MIGRATE_ENTRY:-dist/api/src/migrate.js}"
else
  export SERVER_ENTRY="${SERVER_ENTRY:-dist/server.js}"
  export MIGRATE_ENTRY="${MIGRATE_ENTRY:-dist/migrate.js}"
fi

mkdir -p "$OUT"
# envsubst-only var set — keeps ${} literals inside YAML values intact.
VARS='$APP $NAMESPACE $IMAGE $REVISION $PORT $REPLICAS $MIN_REPLICAS $MAX_REPLICAS $DB_CIDR $SERVER_ENTRY $MIGRATE_ENTRY'
for f in "$TPL"/*.yaml; do
  base="$(basename "$f")"
  envsubst "$VARS" < "$f" > "$OUT/$base"
  echo "rendered $OUT/$base"
done
echo "review with: kubectl diff -f $OUT/"
