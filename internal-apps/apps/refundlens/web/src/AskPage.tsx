import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";

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
    <main>
      <h1>{t("app.title")}</h1>
      <p>{t("app.caption")}</p>
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
        <button type="submit" disabled={busy}>
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

      {err && (
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
      )}

      {ans && (
        <section className="card" data-testid="answer-card">
          <div className="answer">{ans.answer}</div>
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
            <summary>{t("answer.sql")}</summary>
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
              <tbody>
                {ans.rows.slice(0, 20).map((r, i) => (
                  <tr key={i}>
                    {Object.values(r).map((v, j) => (
                      <td key={j}>{String(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
      {!ans && !err && <p className="examples">{t("empty")}</p>}
    </main>
  );
}
