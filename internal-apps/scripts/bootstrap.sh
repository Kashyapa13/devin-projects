#!/usr/bin/env bash
# bootstrap — install deps, start local datastores (docker-compose, local only).
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm install
docker compose up -d

echo "bootstrap done (stub — extend per app as apps land)."
