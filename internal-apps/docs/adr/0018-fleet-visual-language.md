# ADR-0018 — Fleet visual language: one stylesheet + chrome in platform-ui

Status: accepted · Date: 2026-10-15 · Governs: `platform/packages/ui`
(`src/styles.css`, `src/chrome.tsx`) + every app's look.

## Context

The interaction system (ADR-0014) gave the fleet physics and motion law,
but no shared *visual* language: each app hand-rolled inline CSS in its
`index.html` (FastLane ~60 rules, RefundLens ~20) with ad-hoc hex colors,
1px-border tables, inconsistent pills/buttons, and no depth model. The
executive-demo requirement is an Apple/Stripe-caliber finish — glass,
layered elevation, soft status badges, mono numerics, a command dock —
applied *uniformly*, which per-app CSS can never deliver.

Stack note: AGENTS.md lists "Tailwind, platform/ui kit" as the fixed
frontend stack, and `tailwindPreset` exists as tokens — but no app ever
wired tailwindcss (both apps render hand-rolled CSS). Introducing it now
is a new build dependency per app and a rewrite of every styled surface.

## Options

- **(A) Shared stylesheet + chrome components in `@company/ui` (chosen)**
  One `styles.css` (design tokens as CSS custom properties, light + dark
  via `prefers-color-scheme`) exported as `@company/ui/styles.css`, plus
  presentational chrome (`AppHeader`, `CommandDock`, `Segmented`) that
  emit the class contract. Zero new dependencies; the existing semantic
  class contract (`.queue-table`, `.pill-*`, `.panel`, `.card`,
  `.askbar`, `.case-fields`, `.timeline`, `.masked`, `.toasts`) is
  restyled in place so DOM changes stay minimal and e2e selectors hold.
- **(B) Wire tailwindcss into each app** — matches the stack doc's
  letter, but adds a build dep to every app, duplicates utility soup
  across apps with no single source of truth, and rewrites every element.
  The preset's tokens still ship (unchanged) for any future adoption.
- **(C) Per-app CSS files** — rejected: recreates the drift this ADR
  exists to kill; three copies of "glass" diverge by next quarter.

## Decision

`@company/ui` owns the visual language:

- `src/styles.css` — tokens (`--canvas`, `--surface`, `--glass`, `--ink`,
  `--ink-2/3`, `--accent`, `--ring`, `--elev-1..3`, `--ok/warn/bad/info/
  note/zinc` tones), ambient canvas glows, `.appbar` sticky frosted
  header, `.dock` command dock, `.seg` segmented control, `.btn-primary/
  btn-ghost/btn-danger`, `.pill/.badge/.chip` soft badges with indicator
  dots (pulse on critical), `.queue-table`+`.rows` borderless tables
  with divider lines + inset indigo focus rail (box-shadow, never a
  layout-shifting border), `.table-card`/`.panel`/`.card` rounded-2xl
  elevated surfaces, `.timeline`, `.toasts`, `.askbar`, `.skeleton`,
  `.mono` tabular numerics, `p[role=alert]` soft alert panels.
- `src/chrome.tsx` — `AppHeader` (eyebrow/title/action slots, `narrow`
  shell variant), `CommandDock` (`{keys,label}` items → `<kbd>` caps),
  `Segmented` (aria-pressed tab group).
- Laws: semantic tokens only (apps never hard-code a hue); dark mode is
  `prefers-color-scheme` only (no app theme code); CLS=0 (skeletons
  shaped like their content); focus-visible rings on everything
  interactive; `prefers-reduced-motion` / `data-motion="off"` kill every
  CSS transition+animation in the sheet (motion stays ADR-0014's domain
  — this sheet never animates layout).
- Import shape: `import "@company/ui/styles.css"` once in each app's
  `main.tsx`; `vite-env.d.ts` (`vite/client`) covers the module decl.

## Tradeoffs

- Hand-authored CSS, not utility classes: the spec's Tailwind vocabulary
  is expressed as governed tokens + semantic classes instead. An app
  that wants `bg-slate-50/50` gets `--canvas`. Consistency is enforced
  by having one file, not by class-name discipline.
- Color-mix() and backdrop-filter are used — evergreen-baseline browsers
  only (fine for internal fleet).
- The sheet styles element selectors (`button`, `select`) — apps that
  need an unstyled element must opt out with a class; acceptable
  pressure toward uniformity.

## Consequences

- FastLane + RefundLens retrofitted: `index.html` inline styles deleted,
  `AppHeader`/`CommandDock`/`Segmented` adopted, skeleton loading states
  replace "Loading…" text (closes UX-GAP item 17's remainder).
- Flags' labeled demo consumes the same sheet when its owning session
  builds the replica (shim spec is still docs-only — no app exists).
- Any new app from `_template` gets the finish for free by importing
  the sheet — no per-app design work.
- Tailwind wiring remains a future, separate ADR if ever wanted; this
  ADR does not preclude it — `tailwindPreset` stays exported.
