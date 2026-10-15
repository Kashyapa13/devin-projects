import { useTranslation } from "@company/ui";

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`pill pill-${status.toLowerCase()}`}>{status}</span>
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
    <span className={`chip chip-${kind}`}>
      {dueAt.slice(0, 10)} · {t(`sla.${kind === "breach" ? "breaching" : kind}`)}
    </span>
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
