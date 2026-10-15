#!/usr/bin/env bash
# pilot_report — the numbers close. Generates docs/site/numbers.html from
# LIVE sources; nothing is hand-typed.
#
#   ./scripts/pilot_report.sh
#
# Sources: GitHub PR data (gh) for throughput + review turnaround;
# docs/comparison/PILOT-TELEMETRY.md metric lines (`- METRIC k v unit note`)
# for ACU, hours, promise-kept rate, verifier verdicts.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="docs/site/numbers.html"
TEL="docs/comparison/PILOT-TELEMETRY.md"

prs_json=$(gh pr list --repo Kashyapa13/devin-projects --state all \
  --json number,createdAt,mergedAt,reviews --limit 200 2>/dev/null || echo '[]')

python3 - "$prs_json" "$TEL" "$OUT" <<'PY'
import json, re, sys, statistics, datetime
prs = json.loads(sys.argv[1]) if sys.argv[1] != '[]' else []
tel = open(sys.argv[2]).read()
merged = [p for p in prs if p.get("mergedAt")]
turns = []
for p in merged:
    c = datetime.datetime.fromisoformat(p["createdAt"].rstrip("Z"))
    m = datetime.datetime.fromisoformat(p["mergedAt"].rstrip("Z"))
    turns.append((m - c).total_seconds() / 3600)
median_turn = round(statistics.median(turns), 1) if turns else None

# telemetry metric lines: - METRIC <key> <value> <unit> — <note>
metrics = {k: v for k, v, _u in re.findall(r"^- METRIC (\S+) ([\d.]+) ?(\S*)", tel, re.M)}
verdicts = re.findall(r"promise-verdict:\s*(\S+)\s*→\s*(kept|missed|pending)", tel)
kept = sum(1 for _, v in verdicts if v == "kept")
verdict_str = f"{kept}/{len(verdicts)}" if verdicts else "—"

rows = [
    ("PRs opened", str(len(prs)), "gh pr list --state all"),
    ("PRs merged", str(len(merged)), "gh pr list --state all"),
    ("Median PR turnaround (h)", str(median_turn) if median_turn is not None else "—",
     "created→merged, median (D4 gate <48h)"),
    ("ACU consumed (sessions)", metrics.get("acu_total", "not instrumented"), "PILOT-TELEMETRY"),
    ("Median PR turnaround (h, telemetry)", metrics.get("pr_turnaround_median_h", "—"), "PILOT-TELEMETRY"),
    ("Promise-kept rate", verdict_str, "promise-verdict lines in PILOT-TELEMETRY"),
    ("Verifier: PASS", metrics.get("verifier_pass", "—"), "PILOT-TELEMETRY"),
    ("Verifier: FLAG", metrics.get("verifier_flag", "—"), "PILOT-TELEMETRY"),
]
body = "".join(
    f"<tr><td>{k}</td><td class=num>{v}</td><td class=src>{s}</td></tr>"
    for k, v, s in rows)
now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
open(sys.argv[3], "w").write(f"""<!doctype html><html><head><meta charset=utf-8>
<title>pilot — the numbers</title><style>
body{{font:16px/1.5 system-ui;margin:4rem auto;max-width:640px}}
td{{padding:.35rem .75rem;border-bottom:1px solid #eee}}
.num{{font-variant-numeric:tabular-nums;font-weight:600}}
.src{{color:#888;font-size:.8rem}}h2 small{{color:#888;font-weight:400}}
</style></head><body><h2>pilot — the numbers
<small>generated {now} by scripts/pilot_report.sh</small></h2>
<table>{body}</table>
<p><small>Every cell cites its source. Nothing here is hand-typed —
regenerate before the demo.</small></p></body></html>""")
print(f"wrote {sys.argv[3]} ({len(prs)} PRs, {len(merged)} merged, "
      f"median turn {median_turn}h)")
PY
