# UX-GAP — interaction-system retrofit audit

Phase A of the interaction-system retrofit (per the retrofit spec): the
inventory + gap map for every app in `internal-apps/`. One row per gap;
each is either a work item or "already met".

**Status of this doc:** landed alongside the retrofit code rather than
before it (ordering deviation — the Phase-A spec arrived while Phase-B
code was in flight on this branch). The audit below is real: it was
performed against the pre-retrofit tree (`git grep` at `ab7a2cd` shows
zero animation code in `apps/*/web` + `platform/packages/ui/src`) and
live instrumented runs.

## 1. Audit — what exists

### UI stack + component inventory

| App | Stack | Components in scope |
|---|---|---|
| platform-ui | React 19, Tailwind, `@company/ui` (build-time pkg) | `QueueTable`, `Button`, `Card`, `StatusPill`-kit, i18n, tailwindPreset tokens |
| FastLane (`:5175` dev) | React 19 + vite PWA, TanStack Query, i18next | `QueuePage` (tabbed queue, cursor pagination, j/k/Enter/Esc/c/a/r/n/e), `CasePage` (decision panel, masked-PII reveal, audit timeline), `StatusPill`/`RiskBadge`/`SlaChip` |
| RefundLens (`:5173` dev) | same | `AskPage` (ask bar, answer card, SQL disclosure, rows table, watermark) |
| Flags | docs + shim only — **no `/demo` app exists** in the repo | — |

### Motion pre-retrofit
None. `git grep -l 'transition|animate|keyframes|transform' ab7a2cd --
internal-apps/apps/*/web internal-apps/platform/packages/ui/src` → empty.
Loading states were a plain `<p>loading</p>` (no skeletons, no spinners,
no optimistic updates).

### a11y state (axe, live runs)
- FastLane `/` + `/#/case/:id`, RefundLens `/`: **zero critical** in both
  motion modes.
- 28 × serious `color-contrast` findings (pre-existing tokens — same
  before and after retrofit; recorded, not introduced).

### Keyboard flows
- FastLane queue: `j`/`k` row cursor, `Enter` open, `Esc` back, `t` tabs,
  `a` approve, `r` reject (+reason box), `n` note, `e` escalate, `c` claim.
- Case page: `r` reveal (audited), decision keys per AGENTS §anchor.
- RefundLens: `Enter` submits ask.

### FT / test inventory
- FastLane: 31 vitest (statemachine, routes, contract, + new `tests/web.test.tsx`
  covering touched web surfaces) · 2 playwright specs (keyboard, a11y) —
  **dormant CI**: playwright browsers are not installed on this box;
  the specs exist for CI.
- RefundLens: vitest incl. `tests/web.test.tsx` (ask page render).
- platform-ui: 13 vitest incl. `tests/motion.test.tsx` (spring presets,
  frozen flag, swipeDecision law, stagger reduced variant).
- axe FT: live axe runs in both motion modes (this doc) + playwright
  `a11y.spec.ts` for CI.

### PERF BASELINE — BEFORE (measured, same build `?motion=frozen` = pre-polish behavior)

| Metric | BEFORE (frozen) | Method |
|---|---|---|
| keyboard-day routine (j j k Enter Esc j a) | median **2030ms** (runs 1731/2030/2180) | CDP key dispatch ×3 |
| input-delay p75 (INP latency part) | **11.0ms** | PerformanceObserver `event` entries |
| queue GET p95 | **19.7ms** (p50 10.0, max 46.4) | 60× `fetch /api/v1/queue?tab=team` via vite proxy |
| long tasks during burst | 8–10 tasks, 56–467ms | `longtask` observer — see §3 caveat |

Baseline note: BEFORE numbers are the same build with the system disabled
(`?motion=frozen` sets `MotionConfig reducedMotion=always` +
`transition:{duration:0}`), i.e. the pre-polish experience without paying
a historical-checkout penalty. Noisy-VM caveat in §3.

## 2. Gap map — target vs current

| # | Target | Verdict | Evidence / work item |
|---|---|---|---|
| G1 | ONE motion library at shared layer | **CLOSED** | `motion@^12` sole dep in `@company/ui`; apps import primitives only — ADR-0014 (react-spring rejected: no shared-element/FLIP) |
| G2 | Springs not easings (snappy / gentle-settle / overshoot) | **CLOSED** | `SPRINGS` presets; velocity-preserving retargets — verified: drag re-grab mid-settle (8.4→12.6px continuing), morph Escape mid-flight (scale 0.69→1.085 continuous), j/j/k glide retarget |
| G3 | Continuity: row→detail morph (FLIP) | **CLOSED** | `layoutId` morphs on ref cell → case h1; matrix trace pasted (0.66→0.69 fwd, 1.08→1.0 back) |
| G4 | prefers-reduced-motion full path | **CLOSED** | `MotionConfig reducedMotion="user"`; reduced path = crossfades, no springs; axe clean both modes |
| G5 | test-mode freeze for FT determinism | **CLOSED** | `?motion=frozen` / `localStorage["motion-frozen"]` |
| G6 | Materials: blur, elevation, press ~0.97, semantic tokens | **CLOSED** | `Pressable` whileTap 0.97; `elev-1..3` shadows; status/risk/sla tokens + type scale in tailwindPreset (dark-mode-ready) |
| G7 | Drag-to-reassign + drop-target highlight | **CLOSED** | drop-strip in `QueueTable` (`onReassign`), rubber-band 0.35 elastic |
| G8 | Swipe row → approve/reject, settles back < threshold | **CLOSED** | `swipeDecision` (96px) — commit or full settle-back, never half-commits; reject routes to reason box (≥20-char law can't be met by a swipe) |
| G9 | Focus glides on j/k, animation follows input | **CLOSED** | `focusGlide` scrollIntoView; selection changes at input latency (input wins — verified in trace) |
| G10 | Auto-advance on approve | **CLOSED** | optimistic remove + cursor lands on next row mid-motion |
| G11 | Optimistic UI + rollback on error | **CLOSED** | `setQueryData` remove-first, invalidate-on-error rollback, toast on commit |
| G12 | Status pill color-spring | **CLOSED** | `StatusSpring` interpolates pill colors |
| G13 | SLA chip one pulse on crossing red | **CLOSED** | `PulseOnDanger` (edge-triggered, fires on breach transition only) |
| G14 | RefundLens: count-up + staggered draw-in + re-bind (no re-mount) | **CLOSED** | `CountUp` springy value (trace 0→4,551→retarget→39.2M), `StaggerTbody/Tr`; `Reveal` re-binds answer card keyed on result, page never re-mounts |
| G15 | Fenced-rejection shake + inline guidance | **CLOSED** | `Shake` spring keyframes + guidance copy in the error card (verified transform trace −4.6→+1.2→0) |
| G16 | Feel budget: input→feedback <100ms | **MET** | input-delay p75 10.4–11.0ms both modes |
| G17 | Skeletons not spinners | **OPEN (minor)** | queue still renders `<p>loading</p>` — small follow-up; no spinner exists (spec bans spinners, not text states) |
| G18 | Toasts settle from trigger's position | **OPEN (minor)** | toast is bottom-anchored `role=status`; trigger-anchored settle deferred — recorded honestly rather than faked |
| G19 | Toasts with undo | **NOT DONE (by law)** | transitions are one-way legal transitions (FastLane §4) — a fake undo would lie about the audit trail; rationale in ADR-0014 consequences |
| G20 | Flags `/demo` hero flip + slider + typed-confirm | **DEFERRED** | no `/demo` app exists (docs+shim only) — gated on the Flags FB session |
| G21 | Momentum scrolling on lists | **ALREADY MET** | native scroll; no JS was added to the scroll path |
| G22 | queue p95 <1s with motion on | **MET** | p95 7.2ms (n=60, vite proxy) — k6 50VU soak stays deferred to P12 per program scope |
| G23 | axe zero-critical both modes | **MET** | live axe, ON + FROZEN; serious color-contrast = pre-existing tokens (not introduced) |
| G24 | FT green in both modes | **MET (scoped)** | all vitest suites green; web-surface FTs added (`fastlane/tests/web.test.tsx`, ui `motion.test.tsx`); playwright e2e specs exist for CI but can't run on this box (no browsers) |
| G25 | keyboard-day AFTER wins or ties | **MET** | ON median 1662ms vs FROZEN 2030ms — wins; input never delayed |
| G26 | zero long tasks >50ms in interaction bursts | **NOT MET (env)** | long tasks 55–467ms observed in **both** modes on this dev VM (vite dev + React dev build + loaded box); not motion-correlated (frozen shows equal/worse). Prod-build profile measurement is the honest follow-up — no claim of compliance here |
| G27 | masked→reveal blur morph | **CLOSED** | `Reveal` blur-out on legal_name reveal (audited path untouched) |
| G28 | fonts preloaded / zero CLS | **ALREADY MET** | system-ui stack — no webfont loads; morphs use transform-only (no layout thrash) |

## 3. Caveats

- **Long tasks:** the dev VM runs vite HMR + React dev mode + a shared
  box; `longtask` entries of 55–467ms appear in BOTH motion modes during
  bursts and at load. The 8ms/frame budget is the primitive-level
  contract (transform/opacity only, FLIP for layout, no `will-change`
  abuse) — satisfied; the zero-longtask claim needs a prod-build profile
  on an idle box. Not claimed green.
- **INP durations** include render time inside dev React; input-delay
  (the INP latency component) is the reported number.
- **Queue p95** is via the vite dev proxy, n=60 — representative for
  the <1s gate; the 50-VU soak is P12's.

## 4. Open items carried forward

| Item | Owner | Trigger |
|---|---|---|
| G17 skeleton rows for queue loading | next FastLane session | cosmetic |
| G18 trigger-anchored toast settle | next FastLane session | cosmetic |
| G20 Flags `/demo` moments | Flags FB session | `/demo` app exists |
| G26 prod-build longtask profile | P12 perf gate | prod build + quiet box |
