import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AppHeader,
  CommandDock,
  CountUp,
  Reveal,
  Shake,
  Skeleton,
  staggerChild,
  StaggerTbody,
  StaggerTr,
  staggerParent,
  useReducedMotion,
} from "@company/ui";
import { api } from "./api.js";
import { SyncPill } from "./SyncPill.js";

interface WidgetResult {
  widget: string;
  series: Record<string, unknown>[];
  watermark: string | null;
  took_ms: number;
}
interface Answer {
  answer: string;
  understood?: string;
  sql: string;
  rows: Record<string, unknown>[];
  row_count: number;
  watermark: string | null;
  took_ms: number;
  cached: boolean;
}
interface FencedErr {
  code: string;
  message: string;
  detail?: { reason?: string; guidance?: string };
}

/** F-02 — the ask slice: question → answer card + fenced-rejection UX. */
export function AskPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [ans, setAns] = useState<Answer | null>(null);
  const [err, setErr] = useState<FencedErr | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion();

  const submit = async (question: string) => {
    if (!question.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      setAns((await api("/api/v1/ask", { method: "POST", body: { question } })) as Answer);
    } catch (e) {
      const fe = e as Error & FencedErr;
      const detail = fe.detail as FencedErr["detail"];
      setAns(null);
      setErr({
        code: fe.code ?? "ERROR",
        message: fe.message,
        ...(detail ? { detail } : {}),
      });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== input.current) {
        e.preventDefault();
        input.current?.focus();
      }
      if (e.key === "Escape") {
        setQ("");
        setAns(null);
        setErr(null);
        input.current?.focus();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <AppHeader narrow eyebrow={t("app.eyebrow")} title={t("app.title")}>
        <SyncPill />
        <CommandDock
          label={t("keys.hint")}
          items={[
            { keys: "/", label: t("dock.focus") },
            { keys: "⏎", label: t("dock.ask") },
            { keys: "Esc", label: t("dock.clear") },
          ]}
        />
      </AppHeader>
      <main className="shell shell-narrow">
      <KpiGrid />
      <p className="lede">{t("app.caption")}</p>
      <form
        className="askbar"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(q);
        }}
      >
        <input
          ref={input}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("ask.placeholder")}
          aria-label={t("ask.placeholder")}
        />
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? t("loading") : t("ask.submit")}
        </button>
      </form>
      <p className="examples">
        {t("ask.examples")}{" "}
        {[1, 2, 3].map((i) => (
          <code
            key={i}
            role="button"
            tabIndex={0}
            onClick={() => {
              const s = t(`ask.example.${i}`);
              setQ(s);
              void submit(s);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const s = t(`ask.example.${i}`);
                setQ(s);
                void submit(s);
              }
            }}
          >
            {t(`ask.example.${i}`)}
          </code>
        ))}{" "}
      </p>
      <p className="keys">{t("keys.hint")}</p>

      {/* fenced-rejection: shake + inline guidance (ADR-0014 §3) */}
      {err && (
        <Shake trigger={err} className="error-wrap">
        <section className="card error-card" role="alert" data-testid="fenced-error">
          <div className="code">{err.code}</div>
          <h2>{err.code === "FENCED_QUERY_REJECTED" ? t("fenced.title") : t("error.title")}</h2>
          <p>{err.message}</p>
          {err.detail?.reason && (
            <p>
              {t("fenced.reason")}: <code>{err.detail.reason}</code>
            </p>
          )}
          {err.detail?.guidance && <p className="guidance">{err.detail.guidance}</p>}
        </section>
        </Shake>
      )}

      {ans && (
        <Reveal className="card-wrap" key={`${ans.took_ms}-${ans.cached}`}>
        <section className="card" data-testid="answer-card">
          <div className="answer">
            {/* count-up on springy curves (ADR-0014 §3) */}
            <AnswerText text={ans.answer} />
          </div>
          <div className="meta">
            <span className={ans.cached ? "badge badge-cache" : "badge badge-live"}>
              {ans.cached ? t("answer.cached") : t("answer.live")}
            </span>
            <span>
              {t("answer.took")} {ans.took_ms}
              {t("answer.ms")}
            </span>
            <span>
              {t("answer.watermark")}{" "}
              {ans.watermark ? new Date(ans.watermark).toLocaleString() : "—"}
            </span>
            <span>{t("answer.rows", { count: ans.row_count })}</span>
          </div>
          {ans.understood && <p className="examples">{ans.understood}</p>}
          <details className="sql">
            <summary>
              {t("answer.sql")}{" "}
              <span className="badge fenced-badge">{t("fenced.badge")}</span>
            </summary>
            <pre>{ans.sql}</pre>
          </details>
          {ans.rows.length > 0 && (
            <table className="rows">
              <thead>
                <tr>
                  {Object.keys(ans.rows[0]!).map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                </tr>
              </thead>
              {/* staggered draw-in — rows re-bind with transition,
                  never re-mount (ADR-0014 §3) */}
              <StaggerTbody
                variants={staggerParent}
                initial="hidden"
                animate="show"
              >
                {ans.rows.slice(0, 20).map((r, i) => (
                  <StaggerTr key={i} variants={staggerChild(reduced === true)}>
                    {Object.values(r).map((v, j) => (
                      <td key={j}>{String(v)}</td>
                    ))}
                  </StaggerTr>
                ))}
              </StaggerTbody>
            </table>
          )}
        </section>
        </Reveal>
      )}
      {!ans && !err && <p className="examples">{t("empty")}</p>}

      <RollupTable />
      </main>
    </>
  );
}

/** Lag in seconds → "40s" / "7m" / "2h 13m" — mono freshness readout. */
const money = (cents: unknown): string => {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  return (n / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 100_000_00 ? 0 : 2,
  });
};

/** Bento-grid KPI cards — every number is a server-computed series
 *  through the same fenced layer (widget law; LLD F-12 partial). */
function KpiGrid() {
  const { t } = useTranslation();
  const [kpi, setKpi] = useState<Record<string, unknown> | "err" | null>(null);
  useEffect(() => {
    let on = true;
    api("/api/v1/widgets/kpi")
      .then((r) => {
        const row = (r as WidgetResult).series[0];
        // success requires the expected fields — a shapeless payload never
        // becomes a card (missing fields would render as invented zeros)
        if (on && row && "total_refunded_cents" in row) {
          setKpi(row as Record<string, unknown>);
        } else if (on) {
          setKpi("err");
        }
      })
      .catch(() => {
        if (on) setKpi("err");
      });
    return () => {
      on = false;
    };
  }, []);

  const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const cards: { label: string; node: ReactNode; sub?: string | undefined }[] =
    kpi !== null && kpi !== "err"
    ? [
        {
          label: t("kpi.pending"),
          node: <CountUp value={num(kpi.pending_count)} format={(v) => Math.round(v).toLocaleString("en-US")} />,
          sub: `${money(kpi.pending_cents)} ${t("kpi.pending_sub")}`,
        },
        {
          label: t("kpi.total"),
          node: (
            <CountUp
              value={num(kpi.total_refunded_cents)}
              format={(v) => money(Math.round(v))}
            />
          ),
          sub: `${t("kpi.rate")} ${Number(kpi.refund_rate_pct ?? 0)}%`,
        },
        {
          label: t("kpi.p95"),
          node: (
            <CountUp value={num(kpi.p95_ms)} format={(v) => `${Math.round(v).toLocaleString("en-US")} ${t("kpi.ms")}`} />
          ),
          sub: `avg ${num(kpi.avg_ms).toLocaleString("en-US")} ${t("kpi.ms")}`,
        },
      ]
    : [];

  if (kpi === "err") {
    return (
      <p role="alert" className="error" data-testid="kpi-error">
        {t("kpi.load_error")}
      </p>
    );
  }

  return (
    <div className="kpi-grid" data-testid="kpi-grid">
      {kpi === null
        ? [0, 1, 2].map((i) => (
            <section className="kpi" key={i}>
              <p className="label"> </p>
              <Skeleton width="62%" height="1.75rem" />
              <p className="sub"> </p>
            </section>
          ))
        : cards.map((c) => (
            <section className="kpi" key={c.label}>
              <p className="label">{c.label}</p>
              <div className="num">{c.node}</div>
              {c.sub && <p className="sub">{c.sub}</p>}
            </section>
          ))}
    </div>
  );
}

/** agg_daily rollup table — the pre-aggregated store surface; every
 *  row is the same fenced widget layer, no client aggregation. */
function RollupTable() {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  useEffect(() => {
    let on = true;
    api("/api/v1/widgets/daily?limit=12")
      .then((r) => {
        if (on) setRows((r as WidgetResult).series);
      })
      .catch(() => {
        if (on) setRows([]);
      });
    return () => {
      on = false;
    };
  }, []);

  return (
    <section className="panel" data-testid="rollup-panel">
      <h2 className="panel-title">{t("rollup.title")}</h2>
      <p className="panel-sub">{t("rollup.subtitle")}</p>
      {rows === null ? (
        <div className="skel-block">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} width={`${88 - i * 7}%`} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="panel-sub">{t("rollup.empty")}</p>
      ) : (
        <table className="rows">
          <thead>
            <tr>
              <th>{t("rollup.day")}</th>
              <th>{t("rollup.channel")}</th>
              <th>{t("rollup.segment")}</th>
              <th>{t("rollup.reason")}</th>
              <th>{t("rollup.count")}</th>
              <th>{t("rollup.amount")}</th>
              <th>{t("rollup.p95")}</th>
            </tr>
          </thead>
          <StaggerTbody variants={staggerParent} initial="hidden" animate="show">
            {rows.map((r, i) => (
              <StaggerTr key={i} variants={staggerChild(reduced === true)}>
                <td className="mono">{String(r.day).slice(0, 10)}</td>
                <td>{String(r.channel)}</td>
                <td>{String(r.merchant_segment)}</td>
                <td>{String(r.reason_code)}</td>
                <td className="mono">{Number(r.cnt).toLocaleString("en-US")}</td>
                <td className="mono">{money(r.amount)}</td>
                <td className="mono">{r.p95_ms != null ? `${r.p95_ms} ${t("kpi.ms")}` : "—"}</td>
              </StaggerTr>
            ))}
          </StaggerTbody>
        </table>
      )}
    </section>
  );
}

/** Answer string is "<number> — <rest>": the number counts up on a
 *  springy curve; the rest renders verbatim (ADR-0014 §3). */
function AnswerText({ text }: { text: string }) {
  const m = /^(\d[\d,]*)/.exec(text);
  if (!m?.[1]) return <>{text}</>;
  const n = Number(m[1].replaceAll(",", ""));
  if (!Number.isFinite(n)) return <>{text}</>;
  return (
    <>
      <CountUp value={n} format={(v) => Math.round(v).toLocaleString("en-US")} />
      {text.slice(m[1].length)}
    </>
  );
}
