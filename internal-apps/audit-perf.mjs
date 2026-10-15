// PHASE A baseline probe: INP-ish input latency + long tasks during a
// keyboard interaction burst on the FastLane queue, BEFORE motion.
import { chromium } from "playwright-core";

const OFF = process.env.MOTION_OFF === "1";
const TOKEN = (await import("node:fs")).readFileSync("/tmp/fl-token.txt", "utf8").trim();
const browser = await chromium.connectOverCDP("http://localhost:29229");
const ctx = browser.contexts()[0] ?? (await browser.newContext());
const page0=0;const page = await ctx.newPage();
await page.goto("http://localhost:5173/");
await page.evaluate((t) => localStorage.setItem("fl_token", t), TOKEN);
await page.reload();
await page.waitForSelector(".queue-table tbody tr", { timeout: 10000 });

// Long-task observer + input→paint latency probe
await page.evaluate(() => {
  window.__longTasks = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__longTasks.push(Math.round(e.duration));
  }).observe({ entryTypes: ["longtask"] });
  window.__inp = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__inp.push(Math.round(e.duration));
  }).observe({ type: "event", durationThreshold: 16, buffered: true });
});

// Keyboard-day burst: j/k nav x10 + open + back (input latency per keypress)
await page.waitForTimeout(2500); // warm page: settle before measuring
const t0 = Date.now();
for (let i = 0; i < 10; i++) await page.keyboard.press(i % 2 ? "j" : "k");
const jkMs = Date.now() - t0;
await page.keyboard.press("Enter");
await page.waitForSelector("main h1", { timeout: 5000 });
for (let i = 0; i < 3; i++) await page.keyboard.press("Tab");
await page.keyboard.press("Alt+ArrowLeft").catch(() => {});
const keyMs = Date.now() - t0;

// Direct input→feedback probe: measure rAF after synthetic keydown
const inp = await page.evaluate(() => {
  return new Promise((resolve) => {
    const times = [];
    let n = 0;
    function probe() {
      const s = performance.now();
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
      requestAnimationFrame(() => {
        times.push(Math.round(performance.now() - s));
        if (++n < 20) probe();
        else resolve(times);
      });
    }
    probe();
  });
});

const longTasks = await page.evaluate(() => window.__longTasks);
const events = await page.evaluate(() => window.__inp);
inp.sort((a, b) => a - b);
console.log(JSON.stringify({
  keyboard_day_ms: keyMs,
  jk_burst_ms: jkMs,
  input_to_frame_ms: { p50: inp[10], p75: inp[15], max: inp[19] },
  long_tasks_during_burst: longTasks,
  event_durations: events.slice(-10),
}, null, 2));
await page.close();
await browser.close();
