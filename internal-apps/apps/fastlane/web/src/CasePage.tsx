import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Morph,
  Pressable,
  Reveal,
  Shake,
  useKeyboardNav,
  useReducedMotion,
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
  Escape: "back",
};

export function CasePage({ id, autoReject }: { id: string; autoReject?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(autoReject === true);
  const [reason, setReason] = useState("");
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const reduced = useReducedMotion();

  const { data: kase, isLoading, isError } = useQuery({
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

  if (isLoading) return <p>{t("loading")}</p>;
  if (isError || !kase)
    return (
      <main>
        <p role="alert" className="error">
          {t("error.title")}: {t("case.load_error")}
        </p>
      </main>
    );
  return (
    <main>
      {/* shared-element morph: the queue row's ref cell MORPHS into this
          header (same layoutId under the root LayoutGroup) — ADR-0014 §1 */}
      <h1>
        {t("app.title")} —{" "}
        <Morph layoutId={`case-${kase.id}`} style={{ display: "inline-block" }}>
          {kase.customer_ref}
        </Morph>
      </h1>
      <p className="keys" aria-hidden="true">
        {t("case.keys")}
      </p>
      <button
        type="button"
        onClick={() => {
          location.hash = "#/";
        }}
      >
        ← {t("case.back")}
      </button>
      {error && (
        <Shake trigger={error}>
          <p role="alert" className="error">
            {t("error.title")}: {error}
          </p>
        </Shake>
      )}

      <dl className="case-fields">
        <dt>{t("case.fields.customer")}</dt>
        <dd>{kase.customer_ref}</dd>
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
        <dd>{kase.assignee_id ?? "—"}</dd>
        <dt>{t("case.fields.priority")}</dt>
        <dd>{kase.priority}</dd>
      </dl>

      <section className="panel" aria-labelledby="pii-h">
        <h2 id="pii-h">{t("case.pii.title")}</h2>
        {revealed === null ? (
          <p>
            <span className="masked">{t("case.pii.masked")}</span>{" "}
            <button type="button" onClick={() => void doReveal()}>
              {t("case.pii.reveal")}
            </button>
          </p>
        ) : (
          <p>
            {/* masked→reveal blur-out morph (ADR-0014 §3): the masked
                placeholder exits as the revealed value arrives already
                de-blurring in on the snappy spring. */}
            <Reveal spring="snappyUI" style={{ display: "inline-block" }}>
              <strong>{revealed}</strong>
            </Reveal>{" "}
            <span className="keys">({t("case.pii.revealed")})</span>
          </p>
        )}
      </section>

      <section className="panel" aria-labelledby="dec-h">
        <h2 id="dec-h">Decision</h2>
        <button type="button" onClick={() => void act("claim")}>
          {t("action.claim")} (c)
        </button>{" "}
        <button type="button" onClick={() => void act("approve")}>
          {t("action.approve")} (a)
        </button>{" "}
        <button type="button" onClick={() => setRejecting(true)}>
          {t("action.reject")} (r)
        </button>{" "}
        <button type="button" onClick={() => setNoting(true)}>
          {t("action.note")} (n)
        </button>{" "}
        <button type="button" onClick={() => void act("escalate")}>
          {t("action.escalate")} (e)
        </button>
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
          <button type="button" onClick={() => void submitReject()}>
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
          <button type="button" onClick={() => void submitNote()}>
            {t("note.submit")}
          </button>
        </section>
      )}

      <section className="panel" aria-labelledby="audit-h">
        <h2 id="audit-h">{t("audit.title")}</h2>
        <ul className="timeline">
          {(audit ?? []).map((r, i) => (
            <li key={i}>
              {String(r.at)} · {r.actor} · {r.action}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
