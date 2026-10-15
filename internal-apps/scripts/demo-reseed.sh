#!/usr/bin/env bash
# demo-reseed — ONE command that resets every demo surface to its
# DEMO-SCRIPT pre-state. Deterministic, re-runnable. Synthetic data only.
#
#   ./scripts/demo-reseed.sh
#
# Produces: FastLane seeded queue + a breaching case (SLA glowing) + a
# mid-review case for the keyboard day · RefundLens seeded for a ripe ask
# question · flags demo positioned with demo-hero OFF, ready to flip /demo.
set -euo pipefail
cd "$(dirname "$0")/.."

PGC="docker exec fastlane-pg psql -U postgres -v ON_ERROR_STOP=1"
FL_DSN="${FASTLANE_DSN:-postgres://postgres:dev@localhost:55432/fastlane}"
RL_DSN="${REFUNDLENS_DSN:-postgres://postgres:dev@localhost:55432/refundlens}"
FLAGS_DSN="${FLAGS_DSN:-postgres://postgres:dev@localhost:55432/flags}"

echo "== demo-reseed: ensuring databases =="
$PGC -c "SELECT 1" >/dev/null   # fails fast if fastlane-pg isn't up
for db in fastlane refundlens flags decision_db; do
  $PGC -tc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
    || $PGC -c "CREATE DATABASE $db"
done

echo "== fastlane: migrate + kyc-seed-v1 =="
(cd apps/fastlane && DATABASE_URL=$FL_DSN pnpm exec tsx scripts/migrate.ts >/dev/null)
(cd apps/fastlane && DATABASE_URL=$FL_DSN pnpm exec tsx scripts/seed.ts >/dev/null)

echo "== fastlane: demo fixtures (breacher + mid-review) =="
$PGC -d fastlane <<'SQL'
-- D4: a case already breaching its 48h SLA — the chip glows on open
INSERT INTO kyc_cases (customer_id, jurisdiction, risk_score, country,
      status, priority, assignee_id, sla_due_at)
VALUES ('DEMO-BREACH', 'UK', 82, 'GB', 'PENDING', 'high', NULL,
        now() - interval '6 hours')
ON CONFLICT DO NOTHING;
-- D1: a mid-review case claimed by the demo operator for the keyboard day
INSERT INTO kyc_cases (customer_id, jurisdiction, risk_score, country,
      status, priority, assignee_id, sla_due_at)
VALUES ('DEMO-INREVIEW', 'DE', 41, 'DE', 'IN_REVIEW', 'normal',
        (SELECT id FROM app_users WHERE role = 'operator' LIMIT 1),
        now() + interval '30 hours')
ON CONFLICT DO NOTHING;
SQL
echo "   breaching cases past SLA: $($PGC -d fastlane -tc \
  "SELECT count(*) FROM kyc_cases WHERE sla_due_at < now() AND status='PENDING'" | tr -d ' ')"

echo "== refundlens: migrate + seed + ETL (ripe question ready) =="
(cd apps/refundlens && DATABASE_URL=$RL_DSN pnpm exec tsx scripts/migrate.ts >/dev/null)
(cd apps/refundlens && DATABASE_URL=$RL_DSN pnpm exec tsx scripts/seed.ts >/dev/null)
# ETL feeds the rollup — without it asks answer 'no refunds in that window'.
# Demo box: REPLICA_DSN = the same seeded DB (in prod it is the replica).
(cd apps/refundlens && DATABASE_URL=$RL_DSN REPLICA_DSN=$RL_DSN pnpm exec tsx scripts/etl.ts >/dev/null)
echo "   ripe ask: 'refund total by merchant, last 90 days'"

echo "== flags: migrate + position demo-hero OFF =="
if [ -f apps/flags/db/migrations/0001_init.up.sql ]; then
  $PGC -d flags -f apps/flags/db/migrations/0001_init.up.sql 2>/dev/null || true
  if [ -f apps/flags/scripts/seed.ts ]; then
    (cd apps/flags && DATABASE_URL=$FLAGS_DSN pnpm exec tsx scripts/seed.ts >/dev/null)
  else
    $PGC -d flags <<'SQL'
INSERT INTO flags (key, env, targeting)
VALUES ('demo-hero','dev','{"default_enabled":false}'),
       ('demo-hero','staging','{"default_enabled":false}'),
       ('demo-hero','prod','{"default_enabled":false}')
ON CONFLICT (key, env) DO UPDATE
  SET targeting = '{"default_enabled":false}', deleted = false;
SQL
  fi
else
  echo "   (flags app not on this branch — skipping)"
fi

echo
echo "demo-reseed complete — open the three tabs per docs/DEMO-SCRIPT.md"
