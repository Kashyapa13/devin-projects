# @company/ui

Shared UI: Tailwind preset, accessible queue table, keyboard-mode nav,
i18next wrapper, motion primitives (ADR-0014), and the fleet visual
language (ADR-0020).

## API

- `tailwindPreset` — design tokens for `presets: [tailwindPreset]` in an
  app's tailwind.config.
- `<QueueTable caption columns rows actions?/>` — semantic table
  (`<caption>`, `<th scope>`, real `<button>` actions, focusable rows);
  axe-clean by construction.
- `useKeyboardNav(handlers, keyMap?, enabled?)` — keyboard-mode queue
  actions; defaults `j/k/c/a/r` → next/prev/claim/assign/refresh, fully
  remappable; ignores keys typed into inputs.
- `initI18n({resources, lng?, fallbackLng?, onMissingKey?})` — i18next +
  react-i18next instance enforcing the all-strings-externalized gate:
  missing keys warn and render the raw key. `useTranslation` re-exported.
- `@company/ui/styles.css` — the fleet visual language (ADR-0020):
  tokens + glass appbar, soft badges, borderless tables, buttons, dock.
  Import once in `main.tsx`.
- `<AppHeader title eyebrow? narrow?>` — sticky frosted header.
- `<CommandDock items={[{keys,label}]}/>` — shortcut pill for the header.
- `<Segmented options value onChange ariaLabel/>` — tab pill group.

## Usage

```tsx
const i18n = initI18n({ resources });
<I18nextProvider i18n={i18n}>
  <App />
</I18nextProvider>

useKeyboardNav({ next: () => move(+1), claim: claimFocused });
<QueueTable caption={t("queue.caption")} columns={cols} rows={cases} actions={[{label: t("queue.claim"), onSelect: claim}]} />
```

Every component ships an axe test — a violation fails the package suite.
