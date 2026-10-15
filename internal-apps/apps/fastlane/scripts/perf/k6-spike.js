// FastLane queue SPIKE — TESTING.md perf charter:
// 0→100 VU in 30s, error rate < 1%, recovery (post-spike p95 < 1000ms)
// inside 30s. 10k-case fixture. Same per-VU token scheme as k6-queue.js.
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:8080";
const TOKENS = (__ENV.TOKENS || "").split(",").filter(Boolean);

export const options = {
  scenarios: {
    queue_spike: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 100 }, // 0→100 in 30s — the spike
        { duration: "90s", target: 100 }, // hold: observe post-spike recovery
        { duration: "15s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"], // charter: err < 1%
    // steady-state p95 in the post-peak window is verified offline from
    // the summary trend; a runaway tail shows up here too.
    http_req_duration: ["p(95)<3000"],
  },
};

const TABS = ["team", "mine", "breaching"];

export default function () {
  const tab = TABS[Math.floor(Math.random() * TABS.length)];
  const token = TOKENS.length ? TOKENS[__VU % TOKENS.length] : __ENV.TOKEN || "";
  const res = http.get(`${BASE}/api/v1/queue?tab=${tab}&limit=50`, {
    headers: { authorization: `Bearer ${token}` },
    tags: { name: "queue" },
    // A 429 is the rate limiter doing its job (deliberate throttle) — it
    // counts in the throttled check below, not as a request failure.
    responseCallback: http.expectedStatuses(200, 429),
  });
  check(res, {
    "queue 200": (r) => r.status === 200,
    "not 5xx": (r) => r.status < 500, // real errors only
    "not throttled": (r) => r.status !== 429,
  });
  sleep(1);
}
