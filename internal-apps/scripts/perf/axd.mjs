import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const TOKEN = readFileSync("/tmp/fl-token.txt","utf8").trim();
const b = await chromium.connectOverCDP("http://localhost:29229");
const page = await (b.contexts()[0]??await b.newContext()).newPage();
await page.goto("http://localhost:5173/");
await page.evaluate(t=>localStorage.setItem("fastlane_token",t),TOKEN);
await page.goto("http://localhost:5173/#/queue");
await page.waitForSelector(".queue-table tbody tr");
await page.addScriptTag({path:"node_modules/.pnpm/axe-core@4.14.0/node_modules/axe-core/axe.min.js"});
const r = await page.evaluate(async()=>{
  const res = await window.axe.run(document,{resultTypes:["violations"]});
  return res.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.slice(0,3).map(n=>({t:n.target.join(","),h:n.html.slice(0,80)}))}));
});
console.log(JSON.stringify(r,null,1));
await page.close();await b.close();
