#!/usr/bin/env bash
# GATE: `cp -r apps/_template apps/x && pipeline green with no edits`.
# Copies _template → apps/_smoke_run, runs lint/typecheck/test + builds
# the image, always deletes _smoke_run after (trap, even on failure).
set -euo pipefail
cd "$(dirname "$0")/../.."

SMOKE=apps/_smoke_run
LOCK_BAK="$(mktemp)"
cp pnpm-lock.yaml "$LOCK_BAK"
cleanup() {
  rm -rf "$SMOKE"
  cp "$LOCK_BAK" pnpm-lock.yaml
  rm -f "$LOCK_BAK"
}
trap cleanup EXIT

cp -r apps/_template "$SMOKE"

echo "== install (workspace links resolve verbatim) =="
pnpm install

echo "== build: platform deps + app =="
pnpm --filter "@app/template..." build

echo "== lint/typecheck =="
pnpm --filter "@app/template" lint

echo "== test =="
pnpm --filter "@app/template" test

echo "== image build =="
docker build --build-arg APP_DIR=_smoke_run \
  -f "$SMOKE/Dockerfile" -t app-template-smoke:ci .

echo "template-smoke: GREEN — _template instantiates with zero edits"
