# ADR-0014 — One interaction system: springs, continuity, materials

Date: 2026-10-15 · Status: accepted · Owner: platform-ui
Context: the fleet's D1–D10 surfaces needed physics-grade polish WITHOUT
letting every app grow its own animation code — the exact failure mode the
spec bans ("apps import primitives; no app writes its own animation code").

## Library choice — `motion` (motion/react), argued against `react-spring`

**Winner: `motion@12`.** Spring physics is its core model (every value is a
spring; mid-flight retargets preserve velocity by construction — that is the
interruption law, not a feature we bolt on). `layout`/`layoutId` give
shared-element FLIP morphs for free — the row→case morph is a `layoutId`
prop, not hand-rolled `getBoundingClientRect` code. `drag` + `dragElastic`
implement rubber-band resistance natively. `MotionConfig reducedMotion`
honours `prefers-reduced-motion` fleet-wide from one provider.

**Rejected: `@react-spring/web` — argued at full strength.** Its springs are
equally good physics (`useSpring`, `useTrail`, velocity preservation on
retarget), its bundle is smaller, and `useTransition` is mature. It loses on
the one thing this spec makes law: *continuity*. react-spring has no
shared-element/FLIP primitive — a queue row morphing into the case header
would be hand-computed FLIP in app code or a platform wrapper we maintain
ourselves. That is precisely the bespoke animation code the spec forbids
every app from writing — and the platform owning a hand-rolled FLIP engine
is strictly worse than adopting the library that already does it correctly.
Cost of the rejection: motion's API surface is larger (variants, gestures,
layout) — we shrink what apps can reach by exporting only our primitives.

**Also rejected:** CSS transitions (no interruption, no velocity — banned by
the springs-not-easings law); GSAP (license + imperative model fights
React's); Web Animations API (imperative, no spring/FLIP primitives).

## Spring presets (the fleet's only transitions — apps never define their own)

| Preset | stiffness / damping | Use |
|---|---|---|
| `snappyUI` | 420 / 34 | input-adjacent feedback — buttons, chips, focus glides |
| `gentleSettle` | 170 / 26 | panels, lists, page transitions |
| `overshootSettle` | 320 / 14 | hero moments only — visible overshoot, then calm |

## The interruption law (verified, not asserted)

Every animation is interruptible and reversible: retarget a spring
mid-flight and it continues from its current position AND velocity — nothing
snaps back to start, nothing waits. Evidence: three interactions retargeted
mid-flight during the measurement pass (PR evidence section). Same library
law covers the queue row drag: below threshold the drag settles back to
zero — never half-commits.

## Continuity law

Elements come FROM somewhere and go TO somewhere: a queue row's ref cell
MORPHS into the case header via shared `layoutId` under one `LayoutGroup`;
toasts/statuses settle from their trigger; exits animate to somewhere, not
to nothing (`Reveal` exits upward-fade, not opacity-only).

## Materials

Backdrop-blur translucency on overlays, layered `elev-1..3` shadows, ambient
hover (Pressable `whileHover`), press state `scale 0.97` (Pressable
`whileTap`). Semantic token refresh ships in `tailwindPreset`: `status.*`,
`risk.*`, `sla.*`, typography scale, `spacing.touch`, dark-mode-ready
(apps compose `dark:` variants; platform ships no theme).

## Reduced-motion path + test mode

`prefers-reduced-motion` → the full alternative path: CROSSFADE (tween,
opacity-only) replaces every spring — no layout motion, no shake, no drag.
Test mode `?motion=frozen` or `localStorage["motion-frozen"]="1"` freezes
all motion (zero-duration + reduced path) for FT determinism — no rebuild.

## The fixed hierarchy (enforcement)

1. `platform/packages/ui/src/motion/` — the ONLY place motion lives:
   springs, primitives, provider.
2. `QueueTable` gesture hooks — the only app-adjacent surface (platform-owned).
3. Apps compose primitives by name; an app importing `motion`/`react-spring`
   directly fails review (import-lint candidates if it recurs).

## Consequences

- One runtime dep added: `motion@^12` on `@company/ui` only (this ADR is its
  dependency waiver under root AGENTS "new runtime deps need ADR").
- Undo-toasts are NOT shipped: FastLane transitions are one-way by law
  (AGENTS §4) — a toast 'undo' would claim a non-existent legal reversal.
  Toasts carry outcome text; undo returns only if a reversible action lands.
- Flags `/demo` moments are deferred: the demo surface does not exist yet
  (docs + shim only); when it lands it inherits these primitives unchanged.
- Measured budgets (INP <100ms p75, frame trace, keyboard-day before/after,
  queue p95) are pasted on the PR.
