import { PulseOnDanger, StatusSpring, useTranslation } from "@company/ui";

const PILL_COLORS: Record<string, string> = {
  pending: "#1d4ed8",
  in_review: "#b45309",
  approved: "#15803d",
  rejected: "#b91c1c",
  escalated: "#7c3aed",
};

export function StatusPill({ status }: { status: string }) {
  // Status-pill color-spring: the pill's color springs to the new state
  // (ADR-0014 §3), never snaps — even on optimistic-then-rollback flashes.
  return (
    <StatusSpring
      color={PILL_COLORS[status.toLowerCase()] ?? "#475569"}
      className={`pill pill-${status.toLowerCase()}`}
    >
      {status}
    </StatusSpring>
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
  // SLA chip: exactly one pulse on the crossing into red (ADR-0014 §3).
  return (
    <PulseOnDanger danger={kind === "breach"} className={`chip chip-${kind}`}>
      {dueAt.slice(0, 10)} · {t(`sla.${kind === "breach" ? "breaching" : kind}`)}
    </PulseOnDanger>
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
