# @company/ui — changelog

## Unreleased

- Fleet visual language (ADR-0018): `styles.css` export — tokens,
  ambient canvas, glass `.appbar`, `.dock`, `.seg`, `.btn-*`, tone-mapped
  `.pill/.badge/.chip` with indicator dots, borderless `.queue-table`
  with indigo focus rail, `.table-card`/`.panel`/`.card`, `.timeline`,
  `.askbar`, `.skeleton`, `.mono`, reduced-motion + `data-motion="off"`
  guards.
- Dashboard block (ADR-0018): `.kpi-grid`/`.kpi` bento cards with mono
  `.num` readouts, `.sync-pill` mono freshness pill, `.fenced-badge`,
  `.panel-title`/`.panel-sub` section headings, `.skel-block` compact
  skeleton reserve.
- Chrome components: `AppHeader`, `CommandDock`, `Segmented`.
- `Skeleton` accepts `height`/`className`; `QueueTable` row actions get
  `btn-ghost`.
- `tailwindPreset`, `QueueTable`, `useKeyboardNav` (j/k/c/a/r),
  `initI18n` hard-gate wrapper.
