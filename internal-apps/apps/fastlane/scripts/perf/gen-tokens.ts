import { writeFileSync } from "node:fs";
import { mintToken } from "../mint-token.js";

/**
 * Mints N distinct reviewer JWTs for k6 — the read rate limit keys on
 * user sub, so one shared token would throttle the whole run at 5 rps.
 * Each VU round-robins its own sub → per-user budget per VU.
 *
 * Usage: SESSION_SECRET=… tsx scripts/perf/gen-tokens.ts [n] [outfile]
 *   default n=100, outfile=/tmp/k6-tokens.txt (comma-separated)
 */
const n = Number(process.argv[2] ?? 100);
const out = process.argv[3] ?? "/tmp/k6-tokens.txt";
const secret = process.env.SESSION_SECRET;
if (!secret) throw new Error("SESSION_SECRET required");
const toks = Array.from({ length: n }, (_, i) =>
  mintToken({
    secret,
    sub: `99999999-0000-4000-8000-${String(i).padStart(12, "0")}`,
    roles: ["reviewer"],
  }),
);
writeFileSync(out, toks.join(","));
console.log(`minted ${n} k6 tokens → ${out}`);
