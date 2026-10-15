import http from "k6/http";
import { check } from "k6";
import { Counter, Trend } from "k6/metrics";

/**
 * PERF budget-as-code (TESTING.md §PERF):
 *   ask p95 < 2500ms @12mo seed / 20 VU · cache-hit ratio > 60% steady.
 * Run: TOKEN=$(pnpm -s dev-token) k6 run scripts/perf/k6-ask.js
 *      [BASE_URL=http://127.0.0.1:8080 VUS=20 DURATION=60s]
 */
const BASE = __ENV.BASE_URL || "http://127.0.0.1:8080";
const TOKEN = __ENV.TOKEN || "";
const VUS = Number(__ENV.VUS || 20);
const DURATION = __ENV.DURATION || "60s";

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    http_req_duration: ["p(95)<2500"],
    http_req_failed: ["rate<0.01"],
  },
};

const askLatency = new Trend("ask_ms");
const cacheHits = new Counter("cache_hits");
const cacheMisses = new Counter("cache_misses");

const QUESTIONS = [
  "how many refunds by channel last 30 days",
  "refund amount by reason last 7 days",
  "p95 latency by segment last 2 weeks",
  "how many refunds by day last 3 months",
];

export default function () {
  const q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  const res = http.post(
    `${BASE}/api/v1/ask`,
    JSON.stringify({ question: q }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
    },
  );
  askLatency.add(res.timings.duration);
  const ok = check(res, {
    "200 or fenced-400": (r) => r.status === 200 || r.status === 400,
    "envelope present": (r) => {
      try {
        const b = r.json();
        return b.answer !== undefined || b.error !== undefined;
      } catch {
        return false;
      }
    },
  });
  if (ok && res.status === 200) {
    const b = res.json();
    if (b.cached) cacheHits.add(1);
    else cacheMisses.add(1);
  }
}

export function handleSummary(data) {
  const hits = data.metrics.cache_hits?.values?.count ?? 0;
  const misses = data.metrics.cache_misses?.values?.count ?? 0;
  const ratio = hits + misses > 0 ? hits / (hits + misses) : 0;
  const p95 = data.metrics.http_req_duration?.values?.["p(95)"];
  return {
    stdout: JSON.stringify(
      {
        ask_p95_ms: p95,
        budget_ask_p95_ms: 2500,
        ask_p95_ok: p95 < 2500,
        cache_hit_ratio: ratio.toFixed(3),
        budget_cache_hit: 0.6,
        cache_hit_ok: ratio > 0.6,
        vus: VUS,
        duration: DURATION,
      },
      null,
      2,
    ),
  };
}
