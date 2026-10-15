import { ColorSpring, Pulse, useTranslation } from "@company/ui";

// ColorSpring supplies the soft tinted fill; pill classes keep
// text/micro-border colors (the spring is the visible bg).
const PILL_COLOR: Record<string, string> = {
  pending: "var(--line-soft)",
  in_review: "var(--warn-soft)",
  approved: "var(--ok-soft)",
  rejected: "var(--bad-soft)",
  escalated: "var(--violet-soft)",
};

export function StatusPill({ status }: { status: string }) {
  const key = status.toLowerCase();
  return (
    <ColorSpring color={PILL_COLOR[key] ?? "var(--c-muted)"}>
      <span className={`pill pill-${key}`}><i />{status}</span>
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
        <i className={kind === "breach" ? "pulse" : ""} />
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
