// Flags eval API perf budget — TESTING.md PERF:
// p95 < 50ms @ 10k flags × 1k users, 100 RPS burst. Thresholds fail the run.
// Dataset: `tsx scripts/perf-seed.ts` (10k demo-perf-* flags). Users: u-0..u-999.
// Env: BASE_URL (api), RPS, DURATION (smoke override).
import http from "k6/http";
import { check } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:8082";
const RPS = Number(__ENV.RPS || 100);
const DURATION = __ENV.DURATION || "60s";

export const options = {
  scenarios: {
    eval_burst: {
      executor: "constant-arrival-rate",
      rate: RPS,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: 10,
      maxVUs: 50,
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<50"], // eval API p95 < 50ms — the PR promise
    http_req_failed: ["rate<0.001"],
  },
};

const FLAGS = 10_000;
const USERS = 1_000;
let i = 0;

export default function () {
  i++;
  const key = `demo-perf-${(i % FLAGS) + 1}`;
  const userId = `u-${i % USERS}`;
  const res = http.get(
    `${BASE}/api/flags/evaluate?key=${key}&userId=${userId}&env=dev`,
    { tags: { name: "evaluate" } },
  );
  check(res, {
    "eval 200": (r) => r.status === 200,
    "demo-labeled": (r) => r.json("demo") === true,
    "has enabled": (r) => typeof r.json("enabled") === "boolean",
  });
}
