import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppHeader,
  BlurMorph,
  CommandDock,
  Morph,
  Skeleton,
  useKeyboardNav,
  useTranslation,
  type KeyMap,
} from "@company/ui";
import { api, uuid } from "./api.js";
import {
  RiskBadge,
  SlaChip,
  StatusPill,
  type AuditRow,
  type CaseRow,
} from "./components.js";

const KEYMAP: KeyMap = {
  c: "claim",
  a: "assign", // a = approve
  r: "reject", // opens the reason box
  n: "note",
  e: "escalate",
  d: "doc", // issue signed doc link
  Escape: "back",
};

function DocPanel({ docUrl, onExpire }: { docUrl: { url: string; expires_at: string }; onExpire: () => void }) {
  const { t } = useTranslation();
  const [left, setLeft] = useState(() => Date.parse(docUrl.expires_at) - Date.now());
  useEffect(() => {
    const timer = setInterval(() => setLeft(Date.parse(docUrl.expires_at) - Date.now()), 1000);
    return () => clearInterval(timer);
  }, [docUrl.expires_at]);
  useEffect(() => {
    if (left <= 0) onExpire();
  }, [left, onExpire]);
  if (left <= 0) return <p>{t("doc.expired")}</p>;
  const mmss = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`;
  return (
    <p>
      <a href={docUrl.url} target="_blank" rel="noreferrer">{t("action.doc")}</a>{" "}
      <span className="keys">
        {t("doc.expires")} <span className="mono">{mmss}</span> · {t("doc.audited")}
      </span>
    </p>
  );
}

export function CasePage({ id, autoReject }: { id: string; autoReject?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(autoReject === true);
  const [reason, setReason] = useState("");
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [docUrl, setDocUrl] = useState<{ caseId: string; url: string; expires_at: string } | null>(null);

  // navigating case→case: drop the prior case's issued link + revealed PII
  useEffect(() => {
    setDocUrl(null);
    setRevealed(null);
    setError(null);
  }, [id]);

  const { data: kase, isLoading } = useQuery({
    queryKey: ["case", id],
    queryFn: () => api(`/api/v1/cases/${id}`) as Promise<CaseRow>,
  });
  const { data: audit } = useQuery({
    queryKey: ["audit", id],
    queryFn: () => api(`/api/v1/cases/${id}/audit`) as Promise<AuditRow[]>,
    refetchInterval: 4000,
  });

  const act = useCallback(
    async (action: string, body?: object) => {
      try {
        setError(null);
        await api(`/api/v1/cases/${id}/${action}`, {
          method: "POST",
          body: body ?? {},
          idem: `${id}:${action}:${uuid()}`,
        });
        void qc.invalidateQueries({ queryKey: ["case", id] });
        void qc.invalidateQueries({ queryKey: ["audit", id] });
        void qc.invalidateQueries({ queryKey: ["queue"] });
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    [id, qc],
  );

  const doDocUrl = useCallback(async () => {
    try {
      setError(null);
      const res = (await api(`/api/v1/cases/${id}/doc-url`)) as { url: string; expires_at: string };
      setDocUrl({ caseId: id, ...res });
      void qc.invalidateQueries({ queryKey: ["audit", id] });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, qc]);

  const doReveal = useCallback(async () => {
    try {
      setError(null);
      const res = (await api(`/api/v1/cases/${id}/reveal`, {
        method: "POST",
        body: {},
        idem: `${id}:reveal:${uuid()}`,
      })) as { legal_name: string };
      setRevealed(res.legal_name);
      void qc.invalidateQueries({ queryKey: ["audit", id] });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, qc]);

  const submitReject = async () => {
    const ok = await act("reject", { reason });
    if (ok) {
      setRejecting(false);
      setReason("");
    }
  };

  const submitNote = async () => {
    const ok = await act("note", { body: note });
    if (ok) {
      setNoting(false);
      setNote("");
    }
  };

  useKeyboardNav(
    {
      claim: () => void act("claim"),
      assign: () => void act("approve"),
      reject: () => setRejecting(true),
      note: () => setNoting(true),
      escalate: () => void act("escalate"),
      doc: () => void doDocUrl(),
      back: () => {
        location.hash = "#/";
      },
    },
    KEYMAP,
  );

  // ?reject=1 deep-link opens the reason box once data is ready
  useEffect(() => {
    if (autoReject) setRejecting(true);
  }, [autoReject]);

  return (
    <>
      <AppHeader
        eyebrow={t("app.eyebrow")}
        title={
          <>
            {t("app.title")} —{" "}
            <Morph
              morphId={kase ? `case-${kase.id}` : undefined}
            >
              {kase?.customer_ref ?? t("loading")}
            </Morph>
          </>
        }
      >
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            location.hash = "#/";
          }}
        >
          ← {t("case.back")}
        </button>
        <CommandDock
          label={t("case.keys")}
          items={[
            { keys: "C", label: t("action.claim") },
            { keys: "A", label: t("action.approve") },
            { keys: "R", label: t("action.reject") },
            { keys: "N", label: t("action.note") },
            { keys: "E", label: t("action.escalate") },
            { keys: "D", label: t("action.doc") },
            { keys: "Esc", label: t("dock.back") },
          ]}
        />
      </AppHeader>
      {isLoading || !kase ? (
        <main className="shell" aria-busy="true">
          <div className="skel-rows">
            {["45%", "80%", "66%", "72%", "38%", "55%"].map((w, i) => (
              <Skeleton key={i} width={w} />
            ))}
          </div>
        </main>
      ) : (
      <main className="shell">
      {error && (
        <p role="alert" className="error">
          {t("error.title")}: {error}
        </p>
      )}

      <dl className="case-fields">
        <dt>{t("case.fields.customer")}</dt>
        <dd>
          <span className="mono">{kase.customer_ref}</span>
        </dd>
        <dt>{t("case.fields.status")}</dt>
        <dd>
          <StatusPill status={kase.status} />
        </dd>
        <dt>{t("case.fields.risk")}</dt>
        <dd>
          <RiskBadge score={kase.risk_score} />
        </dd>
        <dt>{t("case.fields.sla")}</dt>
        <dd>
          <SlaChip dueAt={kase.sla_due_at} />
        </dd>
        <dt>{t("case.fields.country")}</dt>
        <dd>{kase.country}</dd>
        <dt>{t("case.fields.doctype")}</dt>
        <dd>{kase.doc_type}</dd>
        <dt>{t("case.fields.assignee")}</dt>
        <dd>
          <span className="mono">{kase.assignee_id ?? "—"}</span>
        </dd>
        <dt>{t("case.fields.priority")}</dt>
        <dd>
          <span className="mono">{kase.priority}</span>
        </dd>
      </dl>

      <section className="panel" aria-labelledby="pii-h">
        <h2 id="pii-h">{t("case.pii.title")}</h2>
        {revealed === null ? (
          <p>
            <BlurMorph revealed={false}>
              <span className="masked">{t("case.pii.masked")}</span>
            </BlurMorph>{" "}
            <button type="button" className="btn-ghost" onClick={() => void doReveal()}>
              {t("case.pii.reveal")}
            </button>
          </p>
        ) : (
          <p>
            <BlurMorph revealed>
              <strong>{revealed}</strong>
            </BlurMorph>{" "}
            <span className="keys">({t("case.pii.revealed")})</span>
          </p>
        )}
      </section>

      <section className="panel" aria-labelledby="dec-h">
        <h2 id="dec-h">Decision</h2>
        <div className="actions">
          <button type="button" className="btn-ghost" onClick={() => void act("claim")}>
            {t("action.claim")} <kbd>c</kbd>
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void act("approve")}
          >
            {t("action.approve")} <kbd>a</kbd>
          </button>
          <button type="button" className="btn-danger" onClick={() => setRejecting(true)}>
            {t("action.reject")} <kbd>r</kbd>
          </button>
          <button type="button" className="btn-ghost" onClick={() => setNoting(true)}>
            {t("action.note")} <kbd>n</kbd>
          </button>
          <button type="button" className="btn-ghost" onClick={() => void act("escalate")}>
            {t("action.escalate")} <kbd>e</kbd>
          </button>
        </div>
      </section>

      {rejecting && (
        <section className="panel" aria-labelledby="reject-h">
          <h2 id="reject-h">{t("reject.title")}</h2>
          <textarea
            aria-label={t("reject.title")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reject.placeholder")}
            autoFocus
          />
          <button
            type="button"
            className="btn-danger"
            onClick={() => void submitReject()}
          >
            {t("reject.submit")}
          </button>
        </section>
      )}

      {noting && (
        <section className="panel" aria-labelledby="note-h">
          <h2 id="note-h">{t("note.title")}</h2>
          <textarea
            aria-label={t("note.title")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("note.placeholder")}
            autoFocus
          />
          <button
            type="button"
            className="btn-primary"
            onClick={() => void submitNote()}
          >
            {t("note.submit")}
          </button>
        </section>
      )}

      <section className="panel" aria-labelledby="doc-h">
        <h2 id="doc-h">{t("doc.title")}</h2>
        {docUrl === null || docUrl.caseId !== id ? (
          <p>
            <button type="button" className="btn-ghost" onClick={() => void doDocUrl()}>
              {t("doc.issue")} <kbd>d</kbd>
            </button>
          </p>
        ) : (
          <DocPanel docUrl={docUrl} onExpire={() => setDocUrl(null)} />
        )}
      </section>

      <section className="panel" aria-labelledby="audit-h">
        <h2 id="audit-h">{t("audit.title")}</h2>
        <ul className="timeline">
          {(audit ?? []).map((r, i) => (
            <li key={i}>
              <span className="action">{r.action}</span>{" "}
              <span className="at">{String(r.at)}</span>{" "}
              <span className="actor">{r.actor}</span>
            </li>
          ))}
        </ul>
      </section>
      </main>
      )}
    </>
  );
}
