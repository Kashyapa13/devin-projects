import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * The motion context every app mounts once (ADR-0014).
 * - `prefers-reduced-motion` → the reduced path for every primitive.
 * - Test mode: `?motion=frozen` query param or `localStorage.msono = "1"`
 *   freezes ALL motion (zero-duration, reduced path) so FT runs are
 *   deterministic — toggleable without a rebuild.
 */
export function isMotionFrozen(): boolean {
  try {
    if (typeof location !== "undefined" &&
        new URLSearchParams(location.search).get("motion") === "frozen") {
      return true;
    }
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem("motion-frozen") === "1"
    );
  } catch {
    return false;
  }
}

export function MotionProvider({ children }: { children: ReactNode }) {
  const frozen = isMotionFrozen();
  return (
    <MotionConfig
      reducedMotion={frozen ? "always" : "user"}
      {...(frozen ? { transition: { duration: 0 } } : {})}
    >
      {children}
    </MotionConfig>
  );
}
