import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { api } from "./api.js";

interface SyncHealth {
  watermark: string | null;
  lag_s: number | null;
  last_run_status: string | null;
}

function lagLabel(lag: number): string {
  if (lag < 60) return `${lag}s`;
  const m = Math.floor(lag / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Watermark banner — live freshness pill in the header; amber >90 min
 *  (AGENTS §4 staleness law). Polls /health/sync every 30s. */
export function SyncPill() {
  const { t } = useTranslation();
  const [wm, setWm] = useState<SyncHealth | "err" | null>(null);
  useEffect(() => {
    let on = true;
    const poll = () => {
      api("/api/v1/health/sync")
        .then((r) => {
          if (on) setWm(r as SyncHealth);
        })
        .catch(() => {
          if (on) setWm("err");
        });
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => {
      on = false;
      clearInterval(id);
    };
  }, []);

  const stale = wm !== null && wm !== "err" && (wm.lag_s ?? Infinity) > 90 * 60;
  const tone = wm === "err" || wm === null ? "tone-zinc" : stale ? "tone-warn" : "tone-ok";
  const text =
    wm === "err" || wm === null || wm.lag_s === null
      ? t("sync.unknown")
      : `${t("sync.live")} ${lagLabel(wm.lag_s)}${stale ? ` · ${t("sync.stale")}` : ""}`;
  return (
    <span className={`badge sync-pill ${tone}`} data-testid="sync-pill" title={wm !== null && wm !== "err" ? (wm.watermark ?? "") : ""}>
      {text}
    </span>
  );
}
