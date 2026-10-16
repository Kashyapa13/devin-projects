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

PGC="docker exec -i fastlane-pg psql -U postgres -v ON_ERROR_STOP=1"
# Maintenance DSNs (migrate/seed need DDL + bulk writes) stay superuser;
# the RUNNING APIs must use the non-superuser app roles created below —
# audit_events is insert-only and the tables' PUBLIC revoke binds them.
FL_DSN="${FASTLANE_DSN:-postgres://postgres:dev@localhost:55432/fastlane}"
RL_DSN="${REFUNDLENS_DSN:-postgres://postgres:dev@localhost:55432/refundlens}"
FLAGS_DSN="${FLAGS_DSN:-postgres://postgres:dev@localhost:55432/flags}"
FL_APP_DSN="${FASTLANE_APP_DSN:-postgres://fastlane_app_dev:dev@localhost:55432/fastlane}"
RL_APP_DSN="${REFUNDLENS_APP_DSN:-postgres://refundlens_app_dev:dev@localhost:55432/refundlens}"

echo "== demo-reseed: ensuring databases =="
$PGC -c "SELECT 1" >/dev/null   # fails fast if fastlane-pg isn't up
for db in fastlane refundlens flags decision_db; do
  [ "$($PGC -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | tr -d '[:space:]')" = "1" ] \
    || $PGC -c "CREATE DATABASE $db"
done

echo "== fastlane: migrate + kyc-seed-v1 =="
(cd apps/fastlane && DATABASE_URL=$FL_DSN pnpm exec tsx scripts/migrate.ts >/dev/null)
(cd apps/fastlane && DATABASE_URL=$FL_DSN pnpm exec tsx scripts/seed.ts >/dev/null)
# Dev login identities bound to the migration-created group roles
# (fastlane_app, refundlens_app). Point each API's DATABASE_URL at the
# *_APP_DSN above — never the superuser DSN.
$PGC -d fastlane -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='fastlane_app_dev') THEN CREATE ROLE fastlane_app_dev LOGIN PASSWORD 'dev' IN ROLE fastlane_app; END IF; END \$\$"

echo "== fastlane: demo fixtures (breacher + mid-review) =="
$PGC -d fastlane <<'SQL'
-- D4: a case already breaching its 48h SLA — the chip glows on open.
-- (legal_name_enc stays NULL: the demo reveal path uses a seeded CUST-* row.)
DELETE FROM kyc_cases WHERE customer_ref IN ('DEMO-BREACH','DEMO-INREVIEW');
INSERT INTO kyc_cases (customer_ref, country, risk_score, doc_type,
      status, priority, assignee_id, sla_due_at)
VALUES ('DEMO-BREACH', 'GB', 82, 'PASSPORT', 'PENDING', 'HIGH', NULL,
        now() - interval '6 hours')
ON CONFLICT DO NOTHING;
-- D1: a mid-review case claimed by the seeded reviewer for the keyboard day
INSERT INTO kyc_cases (customer_ref, country, risk_score, doc_type,
      status, priority, assignee_id, sla_due_at)
VALUES ('DEMO-INREVIEW', 'DE', 41, 'NATIONAL_ID', 'IN_REVIEW', 'MED',
        (SELECT id FROM users WHERE 'reviewer' = ANY(roles) LIMIT 1),
        now() + interval '30 hours')
ON CONFLICT DO NOTHING;
SQL
echo "   breaching cases past SLA: $($PGC -d fastlane -tc \
  "SELECT count(*) FROM kyc_cases WHERE sla_due_at < now() AND status='PENDING'" | tr -d ' ')"

echo "== refundlens: migrate + seed + ETL (ripe question ready) =="
(cd apps/refundlens && DATABASE_URL=$RL_DSN pnpm exec tsx scripts/migrate.ts >/dev/null)
(cd apps/refundlens && DATABASE_URL=$RL_DSN pnpm exec tsx scripts/seed.ts >/dev/null)
$PGC -d refundlens -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='refundlens_app_dev') THEN CREATE ROLE refundlens_app_dev LOGIN PASSWORD 'dev' IN ROLE refundlens_app; END IF; END \$\$"
# ETL feeds the rollup — without it asks answer 'no refunds in that window'.
# Demo box: REPLICA_DSN = the same seeded DB (in prod it is the replica).
# SOURCE_TABLE must name the seeded source schema.table — the in-code
# default resolves to public and fails (verifier env-gap finding).
(cd apps/refundlens && DATABASE_URL=$RL_DSN REPLICA_DSN=$RL_DSN SOURCE_TABLE=source.refund_events pnpm exec tsx scripts/etl.ts >/dev/null)
echo "   ripe ask: 'refund total by merchant, last 90 days'"

echo "== flags: migrate + position demo-hero OFF =="
if [ -f apps/flags/db/migrations/0001_init.up.sql ]; then
  # psql -f resolves inside the container — pipe via stdin instead
  # (r2 claim finding: the -f path was silently dropped by || true).
  $PGC -d flags < apps/flags/db/migrations/0001_init.up.sql
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
echo "API DSNs (non-superuser app roles):"
echo "  fastlane:   DATABASE_URL=$FL_APP_DSN"
echo "  refundlens: DATABASE_URL=$RL_APP_DSN"
