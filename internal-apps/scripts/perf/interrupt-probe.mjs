// PHASE C evidence: interruption law — retarget j-presses mid-flight; the
// focus glide must stay monotonic (velocity preserved, no snap-back).
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const TOKEN = readFileSync("/tmp/fl-token.txt","utf8").trim();
const b = await chromium.connectOverCDP("http://localhost:29229");
const page = await (b.contexts()[0] ?? (await b.newContext())).newPage();
await page.goto("http://localhost:5173/");
await page.evaluate(t=>localStorage.setItem("fastlane_token",t),TOKEN);
await page.goto("http://localhost:5173/#/queue");
await page.waitForSelector(".queue-table tbody tr:nth-child(5)",{timeout:15000});
const out = await page.evaluate(async () => {
  const seen=[];
  const raf=()=>new Promise(r=>requestAnimationFrame(r));
  const iv=setInterval(()=>{const el=document.querySelector(".focus-glide");if(el)seen.push(Math.round(el.getBoundingClientRect().top));},4);
  for(let i=0;i<3;i++){document.dispatchEvent(new KeyboardEvent("keydown",{key:"j",bubbles:true}));await new Promise(r=>setTimeout(r,30));}
  for(let i=0;i<150;i++)await raf();
  clearInterval(iv);
  const sel=document.querySelector(".queue-table tr[data-selected]");
  return {glide_samples:seen.length,
    monotonic:seen.every((v,i)=>i===0||v>=seen[i-1]-1),
    first:seen[0]??null,last:seen[seen.length-1]??null,
    landed_row:sel?sel.getAttribute("data-row-id"):null,
    sel_count:document.querySelectorAll(".queue-table tr[data-selected]").length};
});
console.log(JSON.stringify(out,null,1));
await page.close(); await b.close();
