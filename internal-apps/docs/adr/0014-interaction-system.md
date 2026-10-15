# ADR-0014 — Interaction system: one motion library in platform-ui

Status: accepted · Date: 2026-10-15 · Governs: `platform/packages/ui` +
every app's feel.

## Context

Internal apps ship with zero animation code today. The program wants
perceived-speed and delight as an engineered quality (UX-GAP.md): the
queue is the money surface and its feel budget is input→feedback
<100 ms. Law from the constitution: new runtime deps require an ADR;
dependency direction is apps → platform one-way; no app may write its
own animation code (ONE library, primitives in `platform-ui` ONLY).

## Options

### A — `motion` (chosen)

`motion` 14 (the maintained successor line to framer-motion): springs as
first-class transitions, `layoutId` shared-element FLIP morphs,
`LayoutGroup`, `AnimatePresence`, drag gestures with elastic
constraints, `useReducedMotion`, `MotionConfig` global reduced/frozen
mode. MIT. ~30 kB gz runtime for what we use.

### B — `react-spring` (rejected, argued at full strength)

react-spring is the spring-physics purist choice: its animation model
is *only* springs — every value is a `SpringValue`, retargeting is
velocity-preserving by construction, and the `useSpring`/`useSprings`/
`useTransition`/`useTrail` API surface is smaller to teach and harder
to misuse for layout work. It is also lighter and framework-agnostic
(you could in principle reuse configs across non-React surfaces). For
the strict physics requirement it is arguably the *better* library:
motion ships easings and tweens alongside springs, so "springs, not
easings" is a convention we must enforce ourselves, whereas
react-spring makes the wrong thing impossible.

It still loses on the deciding axis: **continuity law**. The required
moments are shared-element morphs — a queue row becoming the case
detail, masked text blurring into revealed text, panels handing off.
react-spring has no layout engine: a FLIP/shared-element morph has to
be hand-built on `getBoundingClientRect` + transform deltas, which is
exactly the error-prone app-level animation code this ADR exists to
keep out of apps. motion provides it as a primitive (`layoutId` inside
a `LayoutGroup`), tested upstream. Second axis: gestures — drag with
elastic/rubber-band constraints and drop detection is built in on
motion and separate-lib (`@use-gesture`) on react-spring, adding a
second dependency to govern. We would rather enforce "springs only" in
40 lines of `springs` presets than reimplement FLIP and gestures in
every app.

### C — CSS transitions / WAAPI per-app (rejected)

Violates the one-library law and the interruption law (CSS animations
can't retarget mid-flight preserving velocity). Also makes
reduced-motion and test-mode flags per-app bespoke — non-starter.

## Decision

`motion@14` is the single animation dependency of the monorepo, vendored
once as a dep of `@company/ui`. Apps may only consume the exported
primitives — they may NOT import `motion`/`framer-motion`/`react-spring`
directly (enforced: `import-lint.ts` gains a forbidden-imports rule;
no other package.json may declare a motion library).

## API surface (platform/packages/ui/src/motion.tsx)

- `springs` — the only allowed curves: `snappy` (500/35, buttons,
  cursor glide), `gentle` (170/26, panels/rows/toasts), `hero`
  (120/14, overshoot-and-settle for hero moments). Object.freeze in
  tests; anything else is a violation.
- `MotionProvider` — `MotionConfig reducedMotion="user"` + `LayoutGroup`;
  `freeze` / `data-motion="off"` ⇒ zero-duration transitions
  (FT determinism).
- `Morph` (shared-element `layoutId` FLIP) · `FocusGlide` (j/k cursor
  glide) · `Pulse` (one-shot spring pulse) · `ColorSpring` (color on a
  spring) · `BlurMorph` (masked→revealed blur-out) · `SwipeRow`
  (drag-x rubber-band, threshold commit, snap-back) · `Pressable`
  (scale .97) · `Stagger`/`staggerChild` · `CountUp` · `Skeleton` ·
  `Toast`+`useToasts` (undo) · re-exports `AnimatePresence`,
  `useReducedMotion`, `motion` for platform-internal use.
- `QueueTable.rowMotion` / `glideId` — apps attach motion props to
  rows without writing animation code.

## The laws (fixed hierarchy — perf > a11y > beauty)

1. **Input always wins** — animation follows focus, never delays it;
   keyboard handlers never await animations.
2. **Interruptible + reversible** — every animated value is a spring;
   mid-flight retargeting preserves velocity; nothing snaps to start.
3. **Continuity** — elements come FROM somewhere and go TO somewhere
   (`layoutId` morphs), never pop in/out.
4. **GPU only** — `transform`/`opacity`/`filter` only; layout changes
   go through FLIP (`layout`/`layoutId`), never width/height tweens.
5. **prefers-reduced-motion** — full alternative path (crossfades, no
   springs) via `MotionConfig reducedMotion="user"`; per-primitive
   `useReducedMotion` where needed.
6. **Test-mode freeze** — `?motion=off` ⇒ `data-motion="off"` ⇒
   zero-duration; FTs run in both modes.
7. **Perceived budget** — input→feedback <100 ms; INP <100 ms p75;
   no long task >50 ms in interaction bursts; zero CLS.

## Tradeoffs

- Cost: ~30 kB gz on every app bundle and a new runtime dep to track
  (the point of this ADR). Mitigation: single lib, tree-shaken,
  primitives-only surface.
- Cost: springs are harder to write tests against than fixed-duration
  tweens — answered by the freeze flag (deterministic) and testing
  semantics over frames.
- We accept policing "springs only" as convention because the rejected
  alternative (react-spring) cannot express the continuity moments —
  see Options.
- Keyboard supremacy is verifiable: PHASE-C gate runs keyboard-day
  timings BEFORE vs AFTER — polish must win or tie, never lose.

## Consequences

- FastLane retrofitted first: row→detail morph, masked→reveal blur,
  pill color-spring, SLA pulse, optimistic decide + spring rollback,
  swipe-to-decide, FocusGlide on j/k, auto-advance, toasts with undo.
- RefundLens/flags wire `CountUp`, `Stagger`, `Morph`, `springs.hero`
  when their owning sessions land the moments (primitives ready).
- import-lint extended: `motion`, `framer-motion`, `react-spring`,
  `@use-gesture/*` are forbidden imports outside `platform/packages/ui`.
