import { ColorSpring, Pulse, useTranslation } from "@company/ui";

// Soft tone washes — the color-spring animates the pill's tint on status
// transitions (ADR-0014 moment); the badge/dot come from the tone map in
// @company/ui/styles.css (ADR-0018).
const PILL_COLOR: Record<string, string> = {
  pending: "rgba(79, 70, 229, 0.14)", // indigo
  in_review: "rgba(180, 83, 9, 0.14)", // amber
  approved: "rgba(4, 120, 87, 0.14)", // emerald
  rejected: "rgba(225, 29, 72, 0.14)", // rose
  escalated: "rgba(124, 58, 237, 0.14)", // violet
};

export function StatusPill({ status }: { status: string }) {
  const key = status.toLowerCase();
  return (
    <ColorSpring color={PILL_COLOR[key] ?? "var(--c-muted)"}>
      <span className={`pill pill-${key}`}>{status}</span>
    </ColorSpring>
  );
}

export function RiskBadge({ score }: { score: number }) {
  const level = score >= 70 ? "high" : score >= 40 ? "med" : "low";
  return <span className={`badge badge-${level}`}>{score}</span>;
}

export function SlaChip({ dueAt }: { dueAt: string }) {
  const { t } = useTranslation();
  const ms = new Date(dueAt).getTime() - Date.now();
  const kind = ms < 0 ? "breach" : ms < 24 * 3600e3 ? "soon" : "ok";
  return (
    <Pulse when={kind === "breach"}>
      <span className={`chip chip-${kind}`}>
        {dueAt.slice(0, 10)} · {t(`sla.${kind === "breach" ? "breaching" : kind}`)}
      </span>
    </Pulse>
  );
}

export interface CaseRow {
  id: string;
  customer_ref: string;
  status: string;
  sla_due_at: string;
  risk_score: number;
  priority?: string;
  country?: string;
  doc_type?: string;
  assignee_id?: string | null;
  version?: number;
}

export interface AuditRow {
  actor: string;
  action: string;
  detail?: unknown;
  req_id?: string;
  at: string;
}
