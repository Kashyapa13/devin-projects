// FastLane queue perf — AGENTS.md §7 gate 7:
// 10k active cases, 50 VU, 5m soak, queue p95 < 1000ms, error rate < 0.1%.
// Env: BASE_URL (api), TOKEN (session JWT), VUS, DURATION (smoke override).
import http from "k6/http";
import { check } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:8080";
const TOKEN = __ENV.TOKEN || "";
const VUS = Number(__ENV.VUS || 50);
const DURATION = __ENV.DURATION || "5m";

export const options = {
  scenarios: {
    queue_load: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<1000"], // queue p95 < 1s — the PR promise
    http_req_failed: ["rate<0.001"],   // error rate < 0.1%
  },
};

const TABS = ["team", "mine", "breaching"];

export default function () {
  const tab = TABS[Math.floor(Math.random() * TABS.length)];
  const res = http.get(`${BASE}/api/v1/queue?tab=${tab}&limit=50`, {
    headers: { authorization: `Bearer ${TOKEN}` },
    tags: { name: "queue" },
  });
  check(res, {
    "queue 200": (r) => r.status === 200,
    "has rows field": (r) => r.json("rows") !== undefined,
  });
}
