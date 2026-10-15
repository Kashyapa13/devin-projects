import { fileURLToPath } from "node:url";
import { defineSeeds, runSeeds } from "@company/testing";
import type { FieldCipher } from "@company/crypto";
import { cipherFromEnv } from "../api/src/crypto.js";

/**
 * "kyc-seed-v1" — the ONLY allowed fixture name (AGENTS.md §3).
 * 40 cases, 3 users, zero PII-shaped values: legal_name plaintexts are
 * SYNTH-ENTITY tokens before encryption, not person-shaped strings.
 */
export function makeRegistry(cipher: FieldCipher, caseCount = 40) {
  const USERS = [
    { id: "11111111-1111-1111-1111-111111111111", handle: "r-reviewer", roles: "{reviewer}" },
    { id: "22222222-2222-2222-2222-222222222222", handle: "s-supervisor", roles: "{supervisor}" },
    { id: "33333333-3333-3333-3333-333333333333", handle: "a-admin", roles: "{admin}" },
    // "+1" service account — the cron/sla-digest principal (not a human seat)
    { id: "44444444-4444-4444-4444-444444444444", handle: "svc-digest", roles: "{service}" },
  ];
  const STATUSES = [
    "PENDING", "PENDING", "PENDING", "PENDING",
    "IN_REVIEW", "IN_REVIEW", "IN_REVIEW",
    "ESCALATED", "APPROVED", "REJECTED",
  ];
  return defineSeeds({
    "kyc-seed-v1": async ({ db, rng }) => {
      // fixture wipe — re-running the seed reproduces the same world
      await db.query("DELETE FROM case_notes");
      await db.query("DELETE FROM kyc_cases");
      await db.query("DELETE FROM users");
      for (const u of USERS) {
        await db.query(
          "INSERT INTO users (id, handle, roles) VALUES ($1, $2, $3)",
          [u.id, u.handle, u.roles],
        );
      }
      for (let i = 0; i < caseCount; i++) {
        const status = STATUSES[i % STATUSES.length];
        const assignee =
          status === "IN_REVIEW"
            ? USERS[i % 2 === 0 ? 0 : 1]!.id
            : null;
        const enc = await cipher.encrypt(
          `SYNTH-ENTITY-${String(i).padStart(4, "0")}`,
        );
        const days = Math.floor(rng() * 10) - 3; // some breaching, some future
        await db.query(
          `INSERT INTO kyc_cases
             (customer_ref, legal_name_enc, country, risk_score, doc_type,
              status, priority, assignee_id, sla_due_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() + ($9 || ' days')::interval)`,
          [
            `CUST-${String(1000 + i)}`,
            enc,
            ["US", "GB", "DE", "JP"][i % 4],
            Math.floor(rng() * 100),
            ["PASSPORT", "DL", "NATIONAL_ID"][i % 3],
            status,
            ["LOW", "MED", "HIGH"][i % 3],
            assignee,
            String(days),
          ],
        );
      }
      await db.query(
        `INSERT INTO case_notes (case_id, author_id, body)
         SELECT id, 'r-reviewer', 'synthetic note — seeded fixture'
         FROM kyc_cases ORDER BY created_at LIMIT 5`,
      );
    },
  });
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // --cases N for the k6 perf fixture (10k); default 40 stays kyc-seed-v1
    const casesArg = process.argv.find((a) => a.startsWith("--cases="));
    const cases = casesArg ? Number(casesArg.split("=")[1]) : 40;
    await runSeeds(pool, makeRegistry(cipherFromEnv(), cases), "kyc-seed-v1");
    console.log(`seeded: kyc-seed-v1 (${cases} cases, ${USERS.length} users)`);
  } finally {
    await pool.end();
  }
}
