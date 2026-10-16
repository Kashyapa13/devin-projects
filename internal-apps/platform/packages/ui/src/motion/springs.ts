/**
 * SPRINGS, not easings (ADR-0014). The fleet's only transitions —
 * stiffness/damping presets, so mid-flight retargets preserve velocity
 * and every animation is interruptible and reversible by construction.
 * Apps NEVER define their own springs or easings.
 */
export const SPRINGS = {
  /** Buttons, chips, focus glides — input-adjacent feedback. */
  snappyUI: { type: "spring", stiffness: 420, damping: 34 },
  /** Panels, lists, page transitions — settle without bounce. */
  gentleSettle: { type: "spring", stiffness: 170, damping: 26 },
  /** Hero moments only — visible overshoot, then calm. */
  overshootSettle: { type: "spring", stiffness: 320, damping: 14 },
} as const;

export type SpringName = keyof typeof SPRINGS;

/**
 * Reduced-motion alternative path (ADR-0014): the same intent, expressed
 * as a crossfade — no springs, no layout motion. Every primitive falls
 * back to this when prefers-reduced-motion (or frozen test mode) is on.
 */
export const CROSSFADE = {
  type: "tween",
  duration: 0.18,
  ease: "easeInOut",
} as const;
