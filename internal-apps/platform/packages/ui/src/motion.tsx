/**
 * THE motion system — the only place app surfaces get animation
 * (program law: apps import primitives, never write their own).
 *
 * Law (ADR-0013):
 * - Springs, not easings — every animated value is a spring.
 * - Interruptible + reversible: retargeting preserves velocity.
 * - Continuity: elements come FROM somewhere and go TO somewhere
 *   (shared-element `layoutId` morphs; `LayoutGroup` at the app root).
 * - prefers-reduced-motion → crossfades only (no springs).
 * - `freeze` (test mode) → zero-duration, deterministic frames for FTs.
 */
import {
  AnimatePresence,
  animate,
  LayoutGroup,
  MotionConfig,
  motion,
  useReducedMotion,
  useSpring,
  type HTMLMotionProps,
  type Transition,
} from "motion/react";
import {
  useCallback,
  type ComponentProps,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

/** Named stiffness/damping presets — the only allowed curves. */
export const springs = {
  /** snappy-UI: buttons, chips, cursor glide */
  snappy: { type: "spring", stiffness: 500, damping: 35 },
  /** gentle-settle: panels, rows, toasts */
  gentle: { type: "spring", stiffness: 170, damping: 26 },
  /** overshoot-and-settle: hero moments only */
  hero: { type: "spring", stiffness: 120, damping: 14 },
} satisfies Record<string, Transition>;

export function useFreeze(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset["motion"] === "off"
  );
}

export function MotionProvider({
  children,
  freeze,
}: {
  children: ReactNode;
  freeze?: boolean;
}): ReactElement {
  const off = useFreeze() || freeze === true;
  const cfg = off
    ? { reducedMotion: "user" as const, transition: { duration: 0 } }
    : { reducedMotion: "user" as const };
  return (
    <MotionConfig {...cfg}>
      <LayoutGroup>{children}</LayoutGroup>
    </MotionConfig>
  );
}

/** Press state — scale ~0.97 on snappy spring (materials law). */
export function Pressable(props: HTMLMotionProps<"button">): ReactElement {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={springs.snappy}
      {...props}
    />
  );
}

/** Shared-element morph: same `morphId` across two mounts = FLIP. */
export function Morph({
  morphId,
  children,
  ...rest
}: HTMLMotionProps<"div"> & { morphId?: string | undefined }): ReactElement {
  // morphId undefined = opt out of layoutId measurement (keeps shared-group
  // measure cost at ~1 element — frame budget law).
  if (morphId === undefined) return <span {...(rest as unknown as ComponentProps<"span">)}>{children as ReactNode}</span>;
  return (
    <motion.div layoutId={morphId} transition={springs.gentle} {...rest}>
      {children}
    </motion.div>
  );
}

/** Spring that glides between targets — the j/k focus cursor. */
/** Last rendered top per glide id — enables manual FLIP (one rect read,
 *  transform-only spring) instead of a LayoutGroup-wide measure. */
const glideTops = new Map<string, number>();

export function FocusGlide({ glideId }: { glideId: string }): ReactElement {
  const key = `focus-glide-${glideId}`;
  const frozen = useFreeze() || useReducedMotion();
  const ref = useCallback((el: HTMLSpanElement | null) => {
    if (!el) {
      glideTops.delete(key); // no stale position when it remounts elsewhere
      return;
    }
    const top = el.getBoundingClientRect().top;
    const prev = glideTops.get(key);
    glideTops.set(key, top);
    if (!frozen && prev !== undefined && prev !== top) {
      // FLIP: start translated by the delta, spring back to 0 — input
      // already rendered at the destination; animation never delays it.
      animate(el, { y: [prev - top, 0] }, springs.snappy);
    }
  }, [key, frozen]);
  return <motion.span ref={ref} className="focus-glide" aria-hidden="true" />;
}

/** One-shot pulse when `when` flips true → settles back (SLA breach). */
export function Pulse({
  when,
  children,
}: {
  when: boolean;
  children: ReactNode;
}): ReactElement {
  const fired = useRef(false);
  const [up, setUp] = useState(false);
  useEffect(() => {
    if (when && !fired.current) {
      fired.current = true;
      setUp(true);
    }
  }, [when]);
  return (
    <motion.span
      initial={false}
      animate={{ scale: up ? 1.18 : 1 }}
      transition={springs.hero}
      onAnimationComplete={() => up && setUp(false)}
      style={{ display: "inline-block", borderRadius: "999px" }}
    >
      {children}
    </motion.span>
  );
}

/** Color change rides a spring — status pills, risk badges. */
export function ColorSpring({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}): ReactElement {
  return (
    <motion.span
      initial={false}
      animate={{ backgroundColor: color }}
      transition={springs.snappy}
      style={{ display: "inline-block", borderRadius: "999px" }}
    >
      {children}
    </motion.span>
  );
}

/** masked → revealed blur-out morph (C4 surfaces). */
export function BlurMorph({
  revealed,
  children,
}: {
  revealed: boolean;
  children: ReactNode;
}): ReactElement {
  const reduced = useReducedMotion();
  return (
    <motion.span
      initial={false}
      animate={{
        filter: revealed ? "blur(0px)" : "blur(6px)",
        opacity: revealed ? 1 : 0.85,
      }}
      transition={reduced ? { duration: 0.15 } : springs.gentle}
      style={{ display: "inline-block", borderRadius: "999px" }}
    >
      {children}
    </motion.span>
  );
}

/** Drag-x swipe row: rubber-band resistance, threshold commit, snap-back —
 *  never half-commits. */
export function SwipeRow({
  onApprove,
  onReject,
  children,
}: {
  onApprove?: () => void;
  onReject?: () => void;
  children: ReactNode;
}): ReactElement {
  const THRESH = 96;
  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.35}
      onDragEnd={(_, info) => {
        if (info.offset.x > THRESH) onApprove?.();
        else if (info.offset.x < -THRESH) onReject?.();
      }}
      transition={springs.gentle}
      style={{ touchAction: "pan-y" }}
    >
      {children}
    </motion.div>
  );
}

/** Count-up on a springy curve (RefundLens numbers). */
export function CountUp({
  value,
  format = (n: number) => Math.round(n).toLocaleString("en-US"),
}: {
  value: number;
  format?: (n: number) => string;
}): ReactElement {
  const spring = useSpring(value, springs.gentle);
  const [shown, setShown] = useState(() => format(value));
  useEffect(() => {
    spring.set(value);
    return spring.on("change", (v) => setShown(format(v)));
  }, [value, spring, format]);
  return <>{shown}</>;
}

/** Stagger container — children mount staggered (chart draw-in). */
export function Stagger({ children }: { children: ReactNode }): ReactElement {
  return (
    <motion.div
      initial="off"
      animate="on"
      variants={{
        on: { transition: { staggerChildren: 0.06 } },
        off: {},
      }}
    >
      {children}
    </motion.div>
  );
}

export const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045 } },
} as const;

export const staggerChild = (reduced: boolean) => ({
  hidden: reduced ? { opacity: 0 } : { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: reduced ? ({ type: "tween", duration: 0.15 } as const) : springs.gentle,
  },
});

/** Table-element staggers — tbody/tr cannot be wrapped in a div. */
export const StaggerList = motion.div;
export const StaggerItem = motion.div;
export const StaggerTbody = motion.tbody;
export const StaggerTr = motion.tr;

/** Continuity: element enters FROM somewhere, not from nothing. */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}): ReactElement {
  const reduced = useFreeze() || useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.99 }}
      transition={{ ...springs.gentle, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Fenced-rejection shake — remounts per `trigger` so keyframes replay. */
export function Shake({
  children,
  trigger,
  className,
}: {
  children: ReactNode;
  trigger: unknown;
  className?: string;
}): ReactElement {
  const reduced = useFreeze() || useReducedMotion();
  return (
    <motion.div
      className={className}
      key={typeof trigger === "object" && trigger !== null ? JSON.stringify(trigger) : String(trigger)}
      initial={{ x: 0 }}
      animate={reduced ? { x: 0 } : { x: [-8, 8, -5, 5, -2, 0] }}
      transition={{ type: "spring", stiffness: 600, damping: 22 }}
    >
      {children}
    </motion.div>
  );
}

/** Focus glide scroll-nudge — follows focus, never delays it. */
export function focusGlide(el: Element | null | undefined, reduced: boolean): void {
  el?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
}

/** Skeleton — no spinners, ever (feel law). */
export function Skeleton({ width = "100%" }: { width?: string }): ReactElement {
  return <motion.span className="skeleton" style={{ width }} animate={{ opacity: [0.5, 0.85, 0.5] }} transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }} />;
}

/** Toast with undo — settles from the trigger side on gentle spring. */
export function Toast({
  id,
  children,
  onUndo,
}: {
  id: string;
  children: ReactNode;
  onUndo?: (() => void) | undefined;
}): ReactElement {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8 }}
      transition={springs.gentle}
      className="toast"
      role="status"
    >
      {children}
      {onUndo ? (
        <Pressable onClick={onUndo} className="toast-undo">
          Undo
        </Pressable>
      ) : null}
    </motion.div>
  );
}

export function useToasts(): {
  toasts: { id: string; node: ReactNode; undo?: (() => void) | undefined }[];
  push: (node: ReactNode, undo?: (() => void) | undefined) => void;
  dismiss: (id: string) => void;
} {
  const [toasts, setToasts] = useState<
    { id: string; node: ReactNode; undo?: (() => void) | undefined }[]
  >([]);
  const dismiss = useCallback(
    (id: string) => setToasts((t) => t.filter((x) => x.id !== id)),
    [],
  );
  const push = useCallback(
    (node: ReactNode, undo?: (() => void) | undefined) => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((t) => [...t, { id, node, undo }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );
  return { toasts, push, dismiss };
}

export { AnimatePresence, motion, useReducedMotion };
