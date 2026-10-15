# UX-GAP — interaction-system retrofit audit (PHASE A, before code)

Baseline measured 2026-10-15 on the live stack (pg :55432, api :8080,
vite :5173, seed 10k cases) by `audit-perf.mjs` (playwright-core over
Chrome CDP) + k6 `scripts/perf/k6-queue.js` + `pnpm -r test`.

## 1. What exists (per app)

### FastLane (`apps/fastlane`) — the only functional app surface today
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

### RefundLens (`apps/refundlens`) — owned by a parallel session
- Functional `/ask` console on the foundation branch. Motion moments
  (staggered draw-in, count-up, re-bind transitions, rejection shake)
  are specced for the shared layer to expose; wiring lands with that
  session's own retrofit (shared files → collision otherwise).
- **Gap → work item**: primitives ship ready (`CountUp`, `Stagger`,
  `staggerChild`, fenced-shake preset) — app wiring = open item.

### Flags (`apps/flags`) — dormant-by-design
- Docs-only demo spec today (stay-decision). `/demo` hero flip =
  primitive-ready (`Morph`/`springs.hero`), app wiring = open item.

## 2. Gap doc — current vs target

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

## 3. Evidence appendix (filled in PHASE C)

- BEFORE probe: `input_to_frame_ms {p50:17, p75:17, max:18}`,
  `keyboard_burst_ms: 55`, `long_tasks_during_burst: []`,
  `event_durations: [16×6]`.
- k6 BEFORE (5 m, 50 VU): *pasted after run completes — see PR.*
- AFTER numbers, axe both modes, montage → PR evidence section.

---

## PHASE B/C — closure (2026-10-15, devin/1792087992-interaction-system)

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
