# flags — stay decision

Production flag admin panel **stays on Power Apps** — no migration, no
vendor bake-off. Decision and reasoning: [ADR-0002](../../../docs/adr/0002-flags-stay-on-power-apps.md).

This is a two-way door: the pilot's Devin replica + the flags trigger define
the reverse path. The trigger requires BOTH:

1. The replica demonstrates a clear capability/run-cost advantage over the
   PA panel, AND
2. The license audit shows Premium spend growth.

If it fires, migration is Devin-built on the scaffold via ADR amendment —
see `exit-design.md` (DORMANT).
