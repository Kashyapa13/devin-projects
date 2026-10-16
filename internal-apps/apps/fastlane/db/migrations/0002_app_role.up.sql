-- App runtime role — the API must never connect as a superuser
-- (verifier breach: `postgres` DSN could UPDATE/DELETE audit_events).
-- Group role per AGENTS §roles; login identities bind at env setup —
-- demo-reseed creates fastlane_app_dev IN ROLE fastlane_app; prod binds
-- via IAM/mapped users. audit_events is append-only at the DB layer:
-- INSERT + SELECT only; the PUBLIC revoke in 0001 covers every role.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fastlane_app') THEN
    CREATE ROLE fastlane_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO fastlane_app;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON users, kyc_cases, state_transitions, case_notes, idempotency_keys
  TO fastlane_app;
GRANT SELECT, INSERT ON audit_events TO fastlane_app;
REVOKE UPDATE, DELETE ON audit_events FROM fastlane_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO fastlane_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fastlane_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO fastlane_app;
