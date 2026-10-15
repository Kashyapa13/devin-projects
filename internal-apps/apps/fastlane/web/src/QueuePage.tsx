import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  focusGlide,
  QueueTable,
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
  type CaseRow,
} from "./components.js";

const KEYMAP: KeyMap = {
  j: "next",
  k: "prev",
  c: "claim",
  a: "assign", // a = approve on FastLane
  r: "reject", // r = reject (reason box opens)
  Enter: "open",
};

export function QueuePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"team" | "mine" | "breaching">("team");
  const [risk, setRisk] = useState<"all" | "high" | "med" | "low">("all");
  const [sel, setSel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["queue", tab],
      queryFn: ({ pageParam }) =>
        api(
          `/api/v1/queue?tab=${tab}&limit=50${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        ) as Promise<{ rows: CaseRow[]; next_cursor?: string }>,
      initialPageParam: "",
      getNextPageParam: (last) => last.next_cursor,
      refetchInterval: 5000,
    });
  const allRows = useMemo(
    () => data?.pages.flatMap((p) => p.rows) ?? [],
    [data],
  );
  const rows = useMemo(() => {
    if (risk === "all") return allRows;
    const band = (s: number) => (s >= 70 ? "high" : s >= 40 ? "med" : "low");
    return allRows.filter((r) => band(r.risk_score) === risk);
  }, [allRows, risk]);
  const current = rows[Math.min(sel, Math.max(rows.length - 1, 0))];

  /**
   * Optimistic decisions (ADR-0014 §4): decide first, confirm after — the
   * row springs out instantly and focus lands on the next case already in
   * motion (auto-advance). On error the row springs BACK (rollback) and a
   * toast carries the reason. No transition can be undone, so the toast
   * shows outcome only — a fake 'undo' would lie about the audit trail.
   */
  const act = useCallback(
    async (action: string, row?: CaseRow, body?: object) => {
      if (!row) return;
      setError(null);
      const optimistic = action === "approve" || action === "reject";
      if (optimistic) {
        qc.setQueryData<{ pages: { rows: CaseRow[] }[] }>(
          ["queue", tab],
          (old) =>
            old
              ? {
                  ...old,
                  pages: old.pages.map((p) => ({
                    ...p,
                    rows: p.rows.filter((r) => r.id !== row.id),
                  })),
                }
              : old,
        );
      }
      try {
        await api(`/api/v1/cases/${row.id}/${action}`, {
          method: "POST",
          body: body ?? {},
          idem: `${row.id}:${action}:${uuid()}`,
        });
        showToast(`${row.customer_ref}: ${action}`);
        void qc.invalidateQueries({ queryKey: ["queue"] });
      } catch (e) {
        // rollback: real data returns, the row springs back into place
        void qc.invalidateQueries({ queryKey: ["queue"] });
        setError((e as Error).message);
      }
    },
    [qc, tab, showToast],
  );

  const openCase = useCallback((row?: CaseRow) => {
    if (row) location.hash = `#/case/${row.id}`;
  }, []);

  // Focus GLIDES between rows on j/k — animation follows focus, never
  // delays it; the keypress updates selection synchronously.
  useEffect(() => {
    focusGlide(
      document.querySelector(`[data-row-id=\"${current?.id ?? ""}\"]`),
      reduced === true,
    );
  }, [current?.id, reduced]);

  useKeyboardNav(
    {
      next: () => setSel((s) => Math.min(s + 1, rows.length - 1)),
      prev: () => setSel((s) => Math.max(s - 1, 0)),
      claim: () => void act("claim", current),
      assign: () => void act("approve", current),
      reject: () => {
        if (current) location.hash = `#/case/${current.id}?reject=1`;
      },
      open: () => openCase(current),
    },
    KEYMAP,
  );

  if (isError)
    return (
      <main>
        <p role="alert" className="error">
          {t("error.title")}: {t("queue.load_error")}
        </p>
      </main>
    );
  if (isLoading) return <p>{t("loading")}</p>;
  return (
    <main>
      <h1>{t("app.title")}</h1>
      <nav aria-label="queue tabs">
        {(["mine", "team", "breaching"] as const).map((x) => (
          <button
            key={x}
            type="button"
            aria-pressed={tab === x}
            onClick={() => {
              setTab(x);
              setSel(0);
            }}
          >
            {t(`queue.tab.${x}`)}
          </button>
        ))}
        <label>
          {t("queue.filter.risk")}{" "}
          <select
            aria-label={t("queue.filter.risk")}
            value={risk}
            onChange={(e) =>
              setRisk(e.target.value as "all" | "high" | "med" | "low")
            }
          >
            {(["all", "high", "med", "low"] as const).map((r) => (
              <option key={r} value={r}>
                {r === "all" ? t("queue.filter.all") : r}
              </option>
            ))}
          </select>
        </label>
      </nav>
      <p className="keys" aria-hidden="true">
        {t("keys.hint")}
      </p>
      {error && (
        <p role="alert" className="error">
          {t("error.title")}: {error}
        </p>
      )}
      <QueueTable<CaseRow>
        caption={t("queue.caption")}
        emptyMessage={t("queue.empty")}
        selectedId={current?.id}
        rows={rows}
        morphIdPrefix="case"
        morphKey="ref"
        gestures={{
          onSwipeRight: (r) => void act("approve", r),
          onSwipeLeft: (r) => {
            // swipe-to-reject opens the reason box — a swipe can't carry
            // the ≥20-char reason the guard requires, so it lands there.
            location.hash = `#/case/${r.id}?reject=1`;
          },
          leftHint: t("action.reject"),
          rightHint: t("action.approve"),
          onReassign: (r) => void act("claim", r),
          reassignHint: t("queue.dragclaim"),
        }}
        columns={[
          { key: "ref", header: t("col.ref"), render: (r) => r.customer_ref },
          {
            key: "status",
            header: t("col.status"),
            render: (r) => <StatusPill status={r.status} />,
          },
          {
            key: "sla",
            header: t("col.sla"),
            render: (r) => <SlaChip dueAt={r.sla_due_at} />,
          },
          {
            key: "risk",
            header: t("col.risk"),
            render: (r) => <RiskBadge score={r.risk_score} />,
          },
        ]}
        actions={[
          { label: t("action.claim"), onSelect: (r) => void act("claim", r) },
          {
            label: t("action.approve"),
            onSelect: (r) => void act("approve", r),
          },
          {
            label: t("action.reject"),
            onSelect: (r) => (location.hash = `#/case/${r.id}?reject=1`),
          },
          { label: t("action.open"), onSelect: (r) => openCase(r) },
        ]}
      />
      {toast && (
        <p role="status" className="toast">
          {toast}
        </p>
      )}
      {hasNextPage && (
        <button type="button" onClick={() => void fetchNextPage()}>
          {isFetchingNextPage ? t("loading") : t("queue.loadmore")}
        </button>
      )}
    </main>
  );
}
