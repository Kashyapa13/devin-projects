import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const TOKEN = readFileSync("/tmp/fl-token.txt","utf8").trim();
const b = await chromium.connectOverCDP("http://localhost:29229");
const page = await (b.contexts()[0] ?? (await b.newContext())).newPage();
await page.goto("http://localhost:5173/");
await page.evaluate(t=>localStorage.setItem("fastlane_token",t),TOKEN);
await page.goto("http://localhost:5173/#/queue");
await page.waitForTimeout(3500);
const st = await page.evaluate(()=>({
  tok: !!localStorage.getItem("fastlane_token"),
  table: !!document.querySelector(".queue-table"),
  rows: document.querySelectorAll(".queue-table tbody tr").length,
  text: (document.querySelector("main")?.innerText||document.body.innerText||"").slice(0,200),
  href: location.href,
}));
console.log(JSON.stringify(st,null,1));
await page.close(); await b.close();
