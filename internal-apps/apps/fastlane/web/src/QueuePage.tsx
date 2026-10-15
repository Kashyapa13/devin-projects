import { useCallback, useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Morph,
  QueueTable,
  Toast,
  springs,
  useKeyboardNav,
  useToasts,
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
  const { toasts, push } = useToasts();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
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

  /** Optimistic decide: the row springs away instantly and focus lands
   *  on the next case; on error the row rolls back with a spring. */
  const act = useCallback(
    async (action: string, row?: CaseRow, body?: object) => {
      if (!row) return;
      setError(null);
      const key = ["queue", tab];
      type Page = { rows: CaseRow[]; next_cursor?: string };
      const deciding = action === "approve" || action === "reject";
      if (!deciding) {
        try {
          await api(`/api/v1/cases/${row.id}/${action}`, {
            method: "POST",
            body: body ?? {},
            idem: `${row.id}:${action}:${uuid()}`,
          });
        } catch (e) {
          setError((e as Error).message);
        } finally {
          void qc.invalidateQueries({ queryKey: ["queue"] });
        }
        return;
      }
      // Optimistic decide with a REAL undo window: the row springs away now;
      // the POST is deferred ~5s so Undo cancels the commit entirely (there
      // is no approved→in_review transition — cache-only "undo" would be a
      // lie). Rollback is per-row (page+index), never a whole-snapshot swap,
      // so overlapping decisions can't resurrect each other's rows.
      const restore = () =>
        qc.setQueryData(key, (d: { pages: Page[] } | undefined) =>
          d
            ? {
                ...d,
                pages: d.pages.map((p) => {
                  const i = p.rows.findIndex(
                    (r) => String(r.id) > String(row.id),
                  );
                  const at = i === -1 ? p.rows.length : i;
                  return p.rows.some((r) => r.id === row.id)
                    ? p
                    : {
                        ...p,
                        rows: [
                          ...p.rows.slice(0, at),
                          row,
                          ...p.rows.slice(at),
                        ],
                      };
                }),
              }
            : d,
        );
      qc.setQueryData(key, (d: { pages: Page[] } | undefined) =>
        d
          ? {
              ...d,
              pages: d.pages.map((p) => ({
                ...p,
                rows: p.rows.filter((r) => r.id !== row.id),
              })),
            }
          : d,
      );
      let cancelled = false;
      push(t(`toast.${action}`), () => {
        cancelled = true;
        restore();
      });
      window.setTimeout(() => {
        void (async () => {
          if (cancelled) return; // Undo pressed — decision never committed
          try {
            await api(`/api/v1/cases/${row.id}/${action}`, {
              method: "POST",
              body: body ?? {},
              idem: `${row.id}:${action}:${uuid()}`,
            });
          } catch (e) {
            restore(); // spring rollback of just this row
            setError((e as Error).message);
          } finally {
            void qc.invalidateQueries({ queryKey: ["queue"] });
          }
        })();
      }, 4500);
    },
    [qc, tab, push, t],
  );

  const openCase = useCallback((row?: CaseRow) => {
    if (row) location.hash = `#/case/${row.id}`;
  }, []);

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
        glideId="queue"
        rows={rows}
        rowMotion={(r) => ({
          drag: "x",
          dragConstraints: { left: 0, right: 0 },
          dragElastic: 0.35,
          transition: springs.gentle,
          onDragEnd: (_, info) => {
            if (info.offset.x > 96) void act("approve", r);
            else if (info.offset.x < -96)
              location.hash = `#/case/${r.id}?reject=1`;
          },
        })}
        columns={[
          {
            key: "ref",
            header: t("col.ref"),
            render: (r) => (
              <Morph morphId={r.id === current?.id ? `case-${r.id}` : undefined}>{r.customer_ref}</Morph>
            ),
          },
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
      {hasNextPage && (
        <button type="button" onClick={() => void fetchNextPage()}>
          {isFetchingNextPage ? t("loading") : t("queue.loadmore")}
        </button>
      )}
      <div className="toasts">
        {toasts.map((x) => (
          <Toast key={x.id} id={x.id} onUndo={x.undo}>
            {x.node}
          </Toast>
        ))}
      </div>
    </main>
  );
}
