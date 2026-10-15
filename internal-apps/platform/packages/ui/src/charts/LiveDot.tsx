import type { ReactElement } from "react";
import { PulseOnDanger, StatusSpring } from "../motion/primitives.js";

/**
 * LiveDot (F-10, ADR-0016): the breathing freshness signal.
 * green <2min · amber 2–5min · red beyond; tooltip = watermark +
 * last-event age. Color springs between states; a crossing INTO red
 * pulses once (primitive law — no bespoke animation).
 */
export function LiveDot({
  beatAt,
  watermark,
  lastEventAt,
  now,
}: {
  beatAt?: string | null;
  watermark?: string | null;
  lastEventAt?: string | null;
  /** injectable clock for tests */
  now?: number;
}): ReactElement {
  const t = now ?? Date.now();
  const ageS = beatAt ? Math.max(0, (t - new Date(beatAt).getTime()) / 1000) : Infinity;
  const state = ageS < 120 ? "ok" : ageS < 300 ? "warn" : "stale";
  const color = state === "ok" ? "#16a34a" : state === "warn" ? "#d97706" : "#dc2626";
  const evAge = lastEventAt ? Math.max(0, (t - new Date(lastEventAt).getTime()) / 1000) : null;
  const fmt = (s: number) => (s < 90 ? `${Math.round(s)}s` : s < 5400 ? `${(s / 60).toFixed(0)}m` : `${(s / 3600).toFixed(1)}h`);
  const tip = beatAt
    ? `last beat ${fmt(ageS)} ago` +
      (watermark ? ` · data as of ${new Date(watermark).toLocaleTimeString()}` : "") +
      (evAge !== null ? ` · last event ${fmt(evAge)} ago` : "")
    : "no heartbeat yet";
  return (
    <PulseOnDanger danger={state === "stale"} className="livedot-wrap">
      <StatusSpring
        color={color}
        className="livedot"
        style={{
          width: 10,
          height: 10,
          borderRadius: 9999,
          display: "inline-block",
        }}
      >
        <span
          data-testid="live-dot"
          data-state={state}
          title={tip}
          aria-label={tip}
          role="status"
          style={{ display: "block", width: 10, height: 10, borderRadius: 9999 }}
        />
      </StatusSpring>
    </PulseOnDanger>
  );
}
