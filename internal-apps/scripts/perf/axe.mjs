import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const TOKEN = readFileSync("/tmp/fl-token.txt","utf8").trim();
const b = await chromium.connectOverCDP("http://localhost:29229");
const results = {};
for (const mode of ["on","off","reduced"]) {
  const ctx = await b.newContext(mode==="reduced"?{reducedMotion:"reduce"}:{});
  const page = await ctx.newPage();
  await page.goto("http://localhost:5173/");
  await page.evaluate(({t,off})=>{localStorage.setItem("fastlane_token",t); if(off)localStorage.setItem("motion","off");},{t:TOKEN,off:mode==="off"});
  await page.goto("http://localhost:5173/#/queue");
  await page.waitForSelector(".queue-table tbody tr",{timeout:15000});
  await page.addScriptTag({path:"node_modules/.pnpm/axe-core@4.14.0/node_modules/axe-core/axe.min.js"});
  const r = await page.evaluate(async()=>{
    const res = await window.axe.run(document,{resultTypes:["violations"]});
    return {critical:res.violations.filter(v=>v.impact==="critical").length,
            serious:res.violations.filter(v=>v.impact==="serious").length,
            total:res.violations.length,
            ids:res.violations.map(v=>v.id)};
  }).catch(e=>({error:String(e)}));
  results[mode]=r;
  // also check the case page
  await page.goto("http://localhost:5173/#/queue");
  await ctx.close();
}
console.log(JSON.stringify(results,null,1));
await b.close();
