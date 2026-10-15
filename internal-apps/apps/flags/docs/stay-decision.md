# flags — stay decision (ADR-0002)

Production flag admin panel **stays on Power Apps** — production continues
on the existing PA panel — no migration, no vendor bake-off; this
engagement reasons Devin vs Power Apps only.

The honest cost on record: whoever owns a flag system owns SDKs for ~60
services + a 99.95% runtime SLA + on-call — that bar gates any future
move, whichever platform owns it.

Decision and reasoning: [ADR-0002](../../../docs/adr/0002-flags-stay-on-power-apps.md).
