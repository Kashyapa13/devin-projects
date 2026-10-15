# Security policy

## Reporting

Report vulnerabilities to the security team via the private channel in
`docs/program/ONCALL.md`. Do not open public issues for suspected
vulnerabilities.

## Scope

- In scope: everything under `apps/` and `platform/packages/`.
- Secrets never live in this repo — `.env.example` files list NAMES only;
  values come from the vault (see `infra/ENVIRONMENTS.md`).
- Data handling follows the classification in `AGENTS.md`
  (C4 regulated → C1 public) and `docs/security/data-classification.md`.
- Every app must clear `docs/security/PROD-READINESS-CHECKLIST.md` before
  its first production deploy.

## Scanning

`.github/workflows/security.yml` (gitleaks · npm audit high · Trivy ·
license) runs on ALL paths — it is never path-filtered.
