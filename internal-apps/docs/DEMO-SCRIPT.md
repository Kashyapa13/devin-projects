# DEMO-SCRIPT.md — the VP demo runbook

Minute-by-minute arc across the ten demo features. **Budget: ≤20 minutes.**
Cut order if long: D9 → D4 → D7. **Never cut D1, D2, D8.**

Fallback law: if the live demo breaks → play that feature's recorded clip
(`docs/site/clips/D-NN.*`) and keep moving. **Never debug in front of the VP.**

## The arc

```
0:00–0:30   cold open — the numbers promise (one line, no slides yet)
0:30–8:30   THE HUMAN MOMENT — D1 D2 D3 D4   (FastLane: the case-worker day)
8:30–13:30  ANSWERS           — D5 D6 D7     (RefundLens: the analyst day)
13:30–16:30 THE FLIP          — D8 D9 D10    (flags + the engine that watches)
16:30–18:00 the numbers close (generated slide — nothing hand-typed)
18:00–20:00 Q&A buffer
```

## Setup (once, before the VP walks in)

`./scripts/demo-reseed.sh` — one command re-seeds everything to the demo
state below (deterministic, re-runnable). Then the three tabs:

| Tab | App | URL | Pre-state |
|---|---|---|---|
| 1 | FastLane | http://localhost:5173 | operator token in `fastlane_token` |
| 2 | RefundLens | http://localhost:5174 | seeded refund data, ask box ready |
| 3 | flags | http://localhost:5175 | `demo-hero` positioned OFF → flips live |

Synthetic data only — no C4 `legal_name` ever appears on screen.

---

## THE HUMAN MOMENT — FastLane (D1–D4)

### D1 — the keyboard-only day  ⏱ 3:30 · NEVER CUT
- **Setup:** queue seeded, top row selected, keyboard only (mouse parked).
- **Steps:** `c` claim → `r` reject → type reason (`docs unclear`) → submit →
  row springs away, focus auto-advances → audit timeline on the case.
- **Say line:** "One operator cleared a queue of forty cases this morning
  without touching the mouse — every action audited in the same transaction."
- **Evidence:** live screen → audit row visible in timeline.
- **Fallback:** `clips/D1-keyboard-day.mp4`.

### D2 — masked PII → audited reveal  ⏱ 2:00 · NEVER CUT
- **Setup:** case page open, `legal_name` masked (`CUST-****`).
- **Steps:** `p` reveal → masked value blurs out → real value → audit row
  `reveal` lands instantly.
- **Say line:** "Regulated PII is masked by default; even looking at it is a
  audited, role-gated event."
- **Evidence:** audit timeline shows the reveal event with actor.
- **Fallback:** `clips/D2-pii-reveal.mp4`.

### D3 — the material feel  ⏱ 1:30
- **Setup:** queue → open a case.
- **Steps:** row morphs into the case detail (shared-element) → j/k glides
  → approve → row springs away → focus lands on the next case in motion.
- **Say line:** "The polish isn't decoration — focus auto-advances, so the
  keyboard day got faster, not slower."
- **Evidence:** visible morph + auto-advance.
- **Fallback:** `clips/D3-morph.mp4`.

### D4 — the SLA chip glows  ⏱ 1:00 · cut first of the human moments
- **Setup:** queue filtered to the seeded breaching case.
- **Steps:** scroll to it → SLA chip red + pulsing past 48h.
- **Say line:** "Breaching work calls itself out — nothing hides in a red queue."
- **Evidence:** red SLA chip on the seeded case.
- **Fallback:** `clips/D4-sla-glow.mp4`.

---

## ANSWERS — RefundLens (D5–D7)

### D5 — ask, and the answer shows its math  ⏱ 2:30
- **Setup:** ask box focused; a ripe refunds question ready ("refund total
  by merchant, last 90 days").
- **Steps:** type → answer card: number + the exact SQL + watermark +
  took_ms → "inspect SQL" → share-link reproduces the view.
- **Say line:** "An analyst asks a question; the app shows the number, the
  query, and the data's age — answers you can audit."
- **Evidence:** answer card with SQL + watermark.
- **Fallback:** `clips/D5-ask.mp4`.

### D6 — the dashboard thinks with you  ⏱ 1:30
- **Setup:** BI dashboard loaded.
- **Steps:** compare mode → KPI deltas → click a chart band → tables
  cross-filter without reload.
- **Say line:** "Same data, different views — all aggregations server-side,
  no client ever writes SQL."
- **Evidence:** cross-filtered dashboard.
- **Fallback:** `clips/D6-dashboard.mp4`.

### D7 — export that stands audit  ⏱ 1:00 · second cut
- **Setup:** export from a filtered view.
- **Steps:** CSV → footer row count = exact count → header comment carries
  the watermark.
- **Say line:** "Every export carries exact counts and a watermark — no
  estimate ever leaves the app."
- **Evidence:** CSV header + count.
- **Fallback:** `clips/D7-export.mp4`.

---

## THE FLIP — flags + engine (D8–D10)

### D8 — the flag flips the page  ⏱ 1:30 · NEVER CUT
- **Setup:** flags app open, `demo-hero` OFF, /demo panel showing control.
- **Steps:** flip on → /demo panel morphs control → HERO VARIANT live.
- **Say line:** "This is the Power Apps flag panel — rebuilt as the pilot's
  capability replica. Production stays on Power Apps; this proves we could."
- **Evidence:** /demo panel flips; banner reads the label.
- **Fallback:** `clips/D8-hero-flip.mp4`.

### D9 — deletes require conviction  ⏱ 1:00 · first cut
- **Setup:** a spare `demo-*` flag.
- **Steps:** type wrong confirm → `CONFIRM_MISMATCH` names the key → type
  the key → deleted → audit row.
- **Say line:** "Env scoping, RBAC, typed-confirm deletes, a full audit
  trail — the boring parts that make flag panels safe."
- **Evidence:** audit row `delete` with actor.
- **Fallback:** `clips/D9-typed-delete.mp4`.

### D10 — the engine that watches itself  ⏱ 1:30
- **Setup:** decision-engine daily shadow report.
- **Steps:** report shows shadow decisions by band, disagreements vs
  humans, confidence distribution → kill-switch demo: engage → every
  decision freezes.
- **Say line:** "The engine decides nothing today — it watches humans and
  reports where they'd disagree, with a one-click kill switch and a named
  strategy writer."
- **Evidence:** daily report JSON rendered + `ENGINE_KILLED` response.
- **Fallback:** `clips/D10-engine.mp4`.

---

## The numbers close  ⏱ 1:30

- **Steps:** open `docs/site/numbers.html` — generated by
  `./scripts/pilot_report.sh` from live telemetry: ACU, review-hours,
  promise-kept rate, verifier verdict counts.
- **Say line:** "Every number you just saw came off the build system —
  here's the full slide, generated, not typed."
- **Rule:** never hand-typed numbers. Regenerate with
  `./scripts/pilot_report.sh` the morning of the demo.

## Rehearsal record

Full-arc runs are timed and recorded in `docs/comparison/PILOT-TELEMETRY.md`
(wall-clock per segment + ACU). Anything over its slot gets fixed or cut
per the order above.
