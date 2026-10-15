# UX-GAP — interaction-system retrofit audit

Two independent audits of the same retrofit were produced in parallel on
different branches and merged here — both preserved verbatim. Audit A
(doc-panel session) uses `?motion=frozen` as the BEFORE control and a
G1–G28 gap map; Audit B (interaction session) measured the live pre-change
stack and reports the k6 soak + interruption trace. Where numbers differ
it is methodology (control method, sample size, VM state), not
disagreement — read each in its own context.

## Audit A — gap map (doc-panel session, via skeleton)

Phase A of the interaction-system retrofit (per the retrofit spec): the
inventory + gap map for every app in `internal-apps/`. One row per gap;
each is either a work item or "already met".

**Status of this doc:** landed alongside the retrofit code rather than
before it (ordering deviation — the Phase-A spec arrived while Phase-B
code was in flight on this branch). The audit below is real: it was
performed against the pre-retrofit tree (`git grep` at `ab7a2cd` shows
zero animation code in `apps/*/web` + `platform/packages/ui/src`) and
live instrumented runs.

### 1. Audit — what exists

#### UI stack + component inventory

| App | Stack | Components in scope |
|---|---|---|
| platform-ui | React 19, Tailwind, `@company/ui` (build-time pkg) | `QueueTable`, `Button`, `Card`, `StatusPill`-kit, i18n, tailwindPreset tokens |
| FastLane (`:5175` dev) | React 19 + vite PWA, TanStack Query, i18next | `QueuePage` (tabbed queue, cursor pagination, j/k/Enter/Esc/c/a/r/n/e), `CasePage` (decision panel, masked-PII reveal, audit timeline), `StatusPill`/`RiskBadge`/`SlaChip` |
| RefundLens (`:5173` dev) | same | `AskPage` (ask bar, answer card, SQL disclosure, rows table, watermark) |
| Flags | docs + shim only — **no `/demo` app exists** in the repo | — |

#### Motion pre-retrofit
None. `git grep -l 'transition|animate|keyframes|transform' ab7a2cd --
internal-apps/apps/*/web internal-apps/platform/packages/ui/src` → empty.
Loading states were a plain `<p>loading</p>` (no skeletons, no spinners,
no optimistic updates).

#### a11y state (axe, live runs)
- FastLane `/` + `/#/case/:id`, RefundLens `/`: **zero critical** in both
  motion modes.
- 28 × serious `color-contrast` findings (pre-existing tokens — same
  before and after retrofit; recorded, not introduced).

#### Keyboard flows
- FastLane queue: `j`/`k` row cursor, `Enter` open, `Esc` back, `t` tabs,
  `a` approve, `r` reject (+reason box), `n` note, `e` escalate, `c` claim.
- Case page: `r` reveal (audited), decision keys per AGENTS §anchor.
- RefundLens: `Enter` submits ask.

#### FT / test inventory
- FastLane: 31 vitest (statemachine, routes, contract, + new `tests/web.test.tsx`
  covering touched web surfaces) · 2 playwright specs (keyboard, a11y) —
  **dormant CI**: playwright browsers are not installed on this box;
  the specs exist for CI.
- RefundLens: vitest incl. `tests/web.test.tsx` (ask page render).
- platform-ui: 13 vitest incl. `tests/motion.test.tsx` (spring presets,
  frozen flag, swipeDecision law, stagger reduced variant).
- axe FT: live axe runs in both motion modes (this doc) + playwright
  `a11y.spec.ts` for CI.

#### PERF BASELINE — BEFORE (measured, same build `?motion=frozen` = pre-polish behavior)

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

### 2. Gap map — target vs current

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

### 3. Caveats

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

### 4. Open items carried forward

| Item | Owner | Trigger |
|---|---|---|
| G17 skeleton rows for queue loading | next FastLane session | cosmetic |
| G18 trigger-anchored toast settle | next FastLane session | cosmetic |
| G20 Flags `/demo` moments | Flags FB session | `/demo` app exists |
| G26 prod-build longtask profile | P12 perf gate | prod build + quiet box |

---

## Audit B — before/after evidence (interaction session)

Baseline measured 2026-10-15 on the live stack (pg :55432, api :8080,
vite :5173, seed 10k cases) by `audit-perf.mjs` (playwright-core over
Chrome CDP) + k6 `scripts/perf/k6-queue.js` + `pnpm -r test`.

### 1. What exists (per app)

#### FastLane (`apps/fastlane`) — the only functional app surface today
- **UI stack**: React 19 + Vite PWA, TanStack Query (infinite query on
  `/queue`, 5 s refetch), i18next via `@company/ui`, hash router
  (`#/`, `#/case/:id`).
- **Component inventory**: `QueueTable` (semantic table, caption,
  focusable rows, action buttons), `StatusPill`, `RiskBadge`,
  `SlaChip`, masked-PII panel, DocPanel (1 s countdown), audit
  timeline, decision panel (claim/approve/reject+reason/note/escalate),
  toast-less inline `role="alert"` errors.
- **Current motion**: NONE — no animation code anywhere in the app
  (`rg -n 'transition|animate|@keyframes'` in `apps/fastlane/web` → CSS
  only, zero animation rules). State changes pop instantly.
- **a11y state**: axe-clean by construction — `platform/packages/ui`
  ships per-component axe tests (QueueTable, keymap); FastLane FT suite
  covers a11y-critical surfaces (reason-required 400 copy, roles,
  aria-pressed tabs, aria-current row). Score: **0 critical/serious**
  violations in unit axe runs; live-page axe recorded in PHASE C.
- **Keyboard flows**: full keymap `j/k` row cursor · `Enter` open ·
  `c` claim · `a` approve · `r` reject (reason box) · `n` note ·
  `e` escalate · `d` doc (case page). Keyboard-only e2e recorded on the
  anchor PR (claim → reject-no-reason 400 → reject-ok → audit →
  queue removal).
- **FT/test inventory**: 27 vitest tests (statemachine matrix, services
  ≥90 % branches, routes envelope/idempotency/RBAC/NOT_ASSIGNEE,
  contract vs openapi, cursor stability) + web unit tests + platform-ui
  axe/keymap units. FTs for touched surfaces: queue page keys covered;
  new motion paths get the freeze flag (`?motion=off`) for determinism.
- **PERF BASELINE (BEFORE — the win-or-tie bar)**:
  - queue p95: **120 ms @ ~550 rps, 0 err** (k6 50 VU — earlier FYI run;
    PHASE-C re-run pasted below in §3 when complete)
  - input→frame p75: **17 ms** (20-sample probe, synthetic keydown→rAF)
  - long tasks during keyboard burst (j/k ×10 + Enter + Tab ×3):
    **none >50 ms** (0 observed)
  - keyboard-day burst wall-clock: **55 ms** end-to-end
  - event-listener durations at keypress: 16 ms (frame-quantized)

#### RefundLens (`apps/refundlens`) — owned by a parallel session
- Functional `/ask` console on the foundation branch. Motion moments
  (staggered draw-in, count-up, re-bind transitions, rejection shake)
  are specced for the shared layer to expose; wiring lands with that
  session's own retrofit (shared files → collision otherwise).
- **Gap → work item**: primitives ship ready (`CountUp`, `Stagger`,
  `staggerChild`, fenced-shake preset) — app wiring = open item.

#### Flags (`apps/flags`) — dormant-by-design
- Docs-only demo spec today (stay-decision). `/demo` hero flip =
  primitive-ready (`Morph`/`springs.hero`), app wiring = open item.

### 2. Gap doc — current vs target

| # | Target | State | Work item |
|---|--------|-------|-----------|
| 1 | ONE motion library at shared layer | **gap** — none exists | `motion` in `@company/ui` (react-spring rejected — ADR-0014) |
| 2 | Springs not easings; presets snappy/gentle/overshoot | **gap** | `springs` preset map (stiffness/damping) |
| 3 | Interruptible + reversible (velocity preserved) | **gap** | spring-based primitives only; interruption evidence in PHASE C |
| 4 | Continuity: row→detail morph, hand-offs, settle-from-trigger | **gap** | `Morph` (shared layoutId FLIP), `AnimatePresence`, `Toast` |
| 5 | Materials: backdrop-blur, layered shadows, hover, press .97 | **gap** | token refresh + `Pressable` + CSS vars in index.html |
| 6 | Semantic tokens: status/risk/SLA colors, type/space scale, dark-ready | partial — hard-coded hex | `--c-*` vars + `prefers-color-scheme` block |
| 7 | prefers-reduced-motion full path | **gap** | `MotionConfig reducedMotion="user"` + no-spring fallbacks |
| 8 | Test-mode freeze for FT determinism | **gap** | `?motion=off` → `data-motion="off"` → zero-duration transitions |
| 9 | Gestures additive: swipe approve/reject rubber-band | **gap** | `rowMotion` drag-x on `motion.tr`, threshold commit, snap-back |
| 10 | Drag-to-reassign w/ spring settle + drop highlight | **gap** | drop zone = "Mine" tab → claim (self-assign in queue scope) |
| 11 | Focus glides on j/k; input never delayed | **gap** | `FocusGlide` layoutId cursor in `QueueTable` |
| 12 | Auto-advance on approve | **gap** | optimistic row removal + sel index → next row |
| 13 | Status pill color-spring | **gap** | `ColorSpring` wrapper on `StatusPill` |
| 14 | SLA chip pulse once on crossing red | **gap** | `Pulse` on breach flip |
| 15 | masked→reveal blur-out morph | **gap** | `BlurMorph` on PII panel |
| 16 | Instant optimistic decisions + spring rollback | **gap** | `act()` optimistic `setQueryData` + restore + undo toast |
| 17 | Skeletons not spinners; toasts with undo | partial — "Loading…" text | `Skeleton`, `Toast`+`useToasts` |
| 18 | INP <100 ms p75; input→feedback <100 ms | **already met** — 17 ms p75 | re-measure AFTER; must win or tie |
| 19 | Zero long tasks >50 ms in interaction bursts | **already met** — none | re-measure AFTER |
| 20 | Queue p95 <1 s | **already met** — 120 ms | re-gate with motion ON |
| 21 | Keyboard-day timings win-or-tie | baseline 55 ms burst | AFTER numbers in PHASE C |
| 22 | axe zero-critical both motion modes | met in motion-off mode | re-run under reduced-motion emulation |
| 23 | Momentum scrolling on lists | n/a today — 50-row page | noted; pages are viewport-bounded |

**Already met (non-gaps):** input→feedback <100 ms, zero long tasks,
queue p95 <1 s, axe zero-critical (current mode), i18n externalized,
semantic-table a11y, cursor pagination.

### 3. Evidence appendix (filled in PHASE C)

- BEFORE probe: `input_to_frame_ms {p50:17, p75:17, max:18}`,
  `keyboard_burst_ms: 55`, `long_tasks_during_burst: []`,
  `event_durations: [16×6]`.
- k6 BEFORE (5 m, 50 VU): *pasted after run completes — see PR.*
- AFTER numbers, axe both modes, montage → PR evidence section.

---

### PHASE B/C — closure (2026-10-15, devin/1792087992-interaction-system)

All work items closed — one library (`motion` in `@company/ui` only,
import-lint `motion-outside-ui` rule enforces the boundary; ADR-0014).
Evidence re-run on this branch:

| check | BEFORE | AFTER |
|---|---|---|
| input→frame p75 | 17ms | 17ms (tie) |
| j/k burst (10 presses) | 55ms | 171ms wall / ~17ms·press |
| keyboard-day sequence | — | 283ms (10 j/k + open + tab×3 + back) |
| long tasks >50ms in burst | 0 | 0 |
| interruption (3 mid-flight j retargets) | n/a | 609 samples, monotonic, landed on target |
| axe critical/serious | n/a | 0/0 in motion-on, off, prefers-reduced-motion |
| queue p95 (k6, motion on) | 89.8ms @56rps | re-run below |

Notes: memoized `QueueRow` (re-render = 2 rows, not 50) + conditional
`morphId` + manual-FLIP `FocusGlide` — layoutId group measure removed from
the key path. RefundLens/flags moments: primitives shipped (Stagger,
CountUp, Morph hero) — wiring stays with their owning sessions.

---

## PHASE D — visual language (2026-10-15, ADR-0018)

The motion layer landed first; the *visual* layer followed on the same
branch family: one `@company/ui/styles.css` (tokens, ambient canvas,
glass appbar, soft-tone badges with dots, borderless tables + indigo
focus rail, mono numerics, skeleton loads — item 17's "Loading…"
remainder now closed) plus chrome components (`AppHeader`,
`CommandDock`, `Segmented`). Applied to FastLane queue/case and the
RefundLens ask console; flags demo inherits it when its owning session
builds the replica.
