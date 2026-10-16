import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { MotionStyle } from "motion/react";
import { CROSSFADE, SPRINGS, type SpringName } from "./springs.js";

/**
 * The fleet's motion primitives (ADR-0014). Apps compose THESE — an app
 * never imports the motion library directly and never defines springs,
 * easings, or keyframes of its own.
 */

/** Shared-element morph handle — row→detail, panel→panel hand-offs. */
export const Morph = motion.div;
export { AnimatePresence, useReducedMotion, LayoutGroup };
export type { MotionValue };

const useTransition = (spring: SpringName) => {
  const reduced = useReducedMotion();
  return reduced ? CROSSFADE : SPRINGS[spring];
};

/** Continuity: element enters FROM somewhere (not from nothing). */
export function Reveal({
  children,
  spring = "gentleSettle",
  className,
  style,
  delay = 0,
}: {
  children: ReactNode;
  spring?: SpringName;
  className?: string;
  style?: MotionStyle;
  delay?: number;
}) {
  const transition = { ...useTransition(spring), delay };
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      {...(style ? { style } : {})}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.99 }}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}

/** Physical press state — scale ~0.97, spring return. */
export function Pressable({
  children,
  className,
  style,
  onClick,
  disabled,
  ariaLabel,
  type = "button",
}: {
  children: ReactNode;
  className?: string;
  style?: MotionStyle;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  type?: "button" | "submit";
}) {
  const transition = useTransition("snappyUI");
  return (
    <motion.button
      type={type}
      className={className}
      {...(style ? { style } : {})}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      whileTap={{ scale: 0.97 }}
      whileHover={{ scale: 1.015 }}
      transition={transition}
    >
      {children}
    </motion.button>
  );
}

/** Pure decision so the settle law is testable without a DOM. */
export function swipeDecision(
  offsetX: number,
  threshold: number,
): "commit-left" | "commit-right" | "settle-back" {
  if (offsetX <= -threshold) return "commit-left";
  if (offsetX >= threshold) return "commit-right";
  return "settle-back";
}

/**
 * Horizontal swipe row — rubber-band resistance at the edge, and it
 * settles BACK on ambiguous drags; never half-commits (ADR-0014 §2).
 */
export function SwipeRow({
  children,
  threshold = 96,
  onSwipeLeft,
  onSwipeRight,
  className,
  leftHint,
  rightHint,
}: {
  children: ReactNode;
  threshold?: number;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  className?: string;
  leftHint?: ReactNode;
  rightHint?: ReactNode;
}) {
  const reduced = useReducedMotion();
  const x = useSpring(0, SPRINGS.snappyUI);
  return (
    <div className="swipe-row-wrap" style={{ position: "relative" }}>
      <div className="swipe-hint left" aria-hidden>
        {leftHint}
      </div>
      <div className="swipe-hint right" aria-hidden>
        {rightHint}
      </div>
      <motion.div
        className={className}
        style={{ x, position: "relative", zIndex: 1 }}
        drag={reduced ? false : "x"}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.4, right: 0.4 }} // rubber-band resistance
        onDragEnd={(_, info) => {
          const d = swipeDecision(info.offset.x, threshold);
          if (d === "commit-left") onSwipeLeft?.();
          else if (d === "commit-right") onSwipeRight?.();
          x.set(0); // always settles home — commit or not
        }}
        transition={SPRINGS.snappyUI}
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Error shake — for the fenced-rejection moment (and any inline error). */
export function Shake({
  children,
  trigger,
  className,
}: {
  children: ReactNode;
  /** change this value to re-fire the shake */
  trigger: unknown;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      // remount per trigger so the keyframes replay on each new error
      key={typeof trigger === "object" && trigger !== null ? JSON.stringify(trigger) : String(trigger)}
      initial={{ x: 0 }}
      animate={reduced === true ? { x: 0 } : { x: [-8, 8, -5, 5, -2, 0] }}
      transition={{ type: "spring", stiffness: 600, damping: 22 }}
    >
      {children}
    </motion.div>
  );
}

/** Count-up numbers on springy curves — RefundLens answer moment. */
export function CountUp({
  value,
  format = (n: number) => Math.round(n).toLocaleString("en-US"),
  spring = "gentleSettle",
}: {
  value: number;
  format?: (n: number) => string;
  spring?: SpringName;
}) {
  const reduced = useReducedMotion();
  // spring starts at 0 — the count visibly climbs to `value` on mount and
  // glides between values on retarget (never restarts from zero).
  const mv = useSpring(0, reduced ? { duration: 0.001 } : SPRINGS[spring]);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    mv.set(value);
  }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

/**
 * Focus GLIDES between rows — animation follows focus, never delays it;
 * input always wins (no transition gating, just a smooth scroll-nudge).
 */
export function focusGlide(el: Element | null | undefined, reduced: boolean) {
  el?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
}

/** Staggered draw-in for lists/charts — children fade+rise in sequence. */
export const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045 } },
};
export const staggerChild = (reduced: boolean) => ({
  hidden: reduced ? { opacity: 0 } : { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: reduced ? CROSSFADE : SPRINGS.gentleSettle,
  },
});
export const StaggerList = motion.div;
export const StaggerItem = motion.div;
/** Table-element staggers — a tbody/tr CANNOT be wrapped in a div. */
export const StaggerTbody = motion.tbody;
export const StaggerTr = motion.tr;

/** Status pill color-spring — color changes spring, not snap. */
export function StatusSpring({
  children,
  color,
  className,
  style,
}: {
  children: ReactNode;
  color: string;
  className?: string;
  style?: MotionStyle;
}) {
  const transition = useTransition("snappyUI");
  return (
    <motion.span
      className={className}
      animate={{ backgroundColor: color }}
      transition={transition}
      style={{ borderRadius: 9999, display: "inline-block", ...(style ?? {}) } as MotionStyle}
    >
      {children}
    </motion.span>
  );
}

/** SLA chip — one pulse when the value crosses into the danger zone. */
export function PulseOnDanger({
  children,
  danger,
  className,
}: {
  children: ReactNode;
  danger: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const was = useRef(danger);
  const crossed = was.current !== danger;
  was.current = danger;
  // keyframes replay only on the crossing into red — exactly one pulse
  return (
    <motion.span
      className={className}
      style={{ display: "inline-block" }}
      animate={
        crossed && danger && reduced !== true ? { scale: [1, 1.12, 1] } : { scale: 1 }
      }
      transition={SPRINGS.overshootSettle}
    >
      {children}
    </motion.span>
  );
}
