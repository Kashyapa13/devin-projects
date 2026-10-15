/**
 * affected-apps — the deployment-law fan-out as data.
 * Prints a JSON array of app dir names affected by base..head:
 *   · apps/<app>/** touched            → that app
 *   · platform/** or workspace files   → ALL real apps (platform is build-time)
 * ft.yml and ci.yml's docker stage matrix off this.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { changedFiles, diffRange, MONOREPO_DIR, realApps } from "./lib.js";

const { base, head } = diffRange();
const changed = changedFiles(base, head);

const GLOBAL =
  /^platform\/|^scripts\/|^docs\/|^pnpm-(lock|workspace)|^package\.json$|^turbo\.json$|^tsconfig\.base\.json$|^docker-compose\.yml$|^\./;

const apps = new Set<string>();
let fanOut = false;
for (const f of changed) {
  const m = /^apps\/([^/]+)\//.exec(f);
  if (m && m[1] && !m[1].startsWith("_")) apps.add(m[1]);
  if (GLOBAL.test(f)) fanOut = true;
}

const withFt = (name: string) =>
  existsSync(join(MONOREPO_DIR, "apps", name, "playwright.config.ts"));

const affected = fanOut ? realApps() : [...apps];
console.log(
  JSON.stringify({
    apps: affected.sort(),
    ft: affected.filter(withFt).sort(),
    fanOut,
  }),
);
