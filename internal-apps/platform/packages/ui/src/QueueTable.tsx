import { motion, type PanInfo } from "motion/react";
import { useRef, type ReactNode } from "react";
import { swipeDecision, Morph, AnimatePresence } from "./motion/index.js";
import { SPRINGS } from "./motion/springs.js";

export interface QueueColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

export interface QueueAction<T> {
  label: string;
  onSelect: (row: T) => void;
}

/** Direct-manipulation gestures for a queue row (ADR-0014 §2). */
export interface QueueGestures<T> {
  /** horizontal swipe commits — rubber-band resistance when ambiguous. */
  onSwipeLeft?: (row: T) => void;
  onSwipeRight?: (row: T) => void;
  swipeThreshold?: number;
  leftHint?: ReactNode;
  rightHint?: ReactNode;
  /** drag a row onto the drop strip to reassign it (spring settlement). */
  onReassign?: (row: T) => void;
  reassignHint?: ReactNode;
}

export interface QueueTableProps<T extends { id: string | number }> {
  /** Table caption — required for a11y (screen readers announce it). */
  caption: string;
  columns: QueueColumn<T>[];
  rows: T[];
  /** Per-row actions rendered as real <button>s. */
  actions?: QueueAction<T>[];
  emptyMessage?: string;
  /** Row id the keyboard cursor sits on — sets aria-current + data-selected. */
  selectedId?: string | number | undefined;
  /** Direct-manipulation gestures (additive — keyboard stays supreme). */
  gestures?: QueueGestures<T>;
  /** layoutId prefix for shared-element row→detail morphs (ADR-0014 §1). */
  morphIdPrefix?: string;
  /** Cell key the morph element wraps (default: first column). */
  morphKey?: string;
}

const MRow = motion.tr;

/**
 * Accessible queue table — semantic <table>/<th scope>/<caption>, rows
 * are real focusable elements, actions are real buttons. Axe-clean by
 * construction; verified per-component in tests.
 *
 * Motion (ADR-0014): when `gestures` is given, rows drag with rubber-band
 * edge resistance — a swipe past threshold commits, anything else settles
 * back (never half-commits); dragging a row onto the drop strip reassigns
 * it with spring settlement. When `morphIdPrefix` is given, each row's
 * lead cell carries a shared layoutId so a row can MORPH into the detail
 * view (FLIP — elements come from somewhere, go to somewhere).
 */
export function QueueTable<T extends { id: string | number }>({
  caption,
  columns,
  rows,
  actions = [],
  emptyMessage = "No items",
  selectedId,
  gestures,
  morphIdPrefix,
  morphKey,
}: QueueTableProps<T>) {
  const stripRef = useRef<HTMLDivElement>(null);
  const morphKey_ = morphKey ?? columns[0]?.key ?? "";
  const hasGestures = !!gestures && (!!gestures.onSwipeLeft || !!gestures.onSwipeRight || !!gestures.onReassign);

  const onDragEnd = (row: T) => (_: unknown, info: PanInfo) => {
    // drop-strip reassign wins over a plain swipe
    const r = stripRef.current?.getBoundingClientRect();
    if (
      r &&
      gestures?.onReassign &&
      info.point.x >= r.left && info.point.x <= r.right &&
      info.point.y >= r.top && info.point.y <= r.bottom
    ) {
      gestures.onReassign(row);
      return;
    }
    const d = swipeDecision(info.offset.x, gestures?.swipeThreshold ?? 96);
    if (d === "commit-left") gestures?.onSwipeLeft?.(row);
    else if (d === "commit-right") gestures?.onSwipeRight?.(row);
    // else: settle back — the spring returns the row untouched
  };

  return (
    <>
      {gestures?.onReassign && (
        <div ref={stripRef} className="drop-strip" data-testid="reassign-drop">
          {gestures.reassignHint}
        </div>
      )}
      <table className="queue-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col">
                {c.header}
              </th>
            ))}
            {actions.length > 0 && <th scope="col">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (actions.length > 0 ? 1 : 0)}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            <AnimatePresence initial={false}>
              {rows.map((row) =>
                hasGestures || morphIdPrefix ? (
                  <MRow
                    key={row.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={SPRINGS.snappyUI}
                    tabIndex={0}
                    data-row-id={String(row.id)}
                    {...(row.id === selectedId
                      ? { "data-selected": "true", "aria-current": "true" }
                      : {})}
                    drag={hasGestures ? true : false}
                    dragDirectionLock
                    dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                    dragElastic={0.35} // rubber-band resistance
                    onDragEnd={onDragEnd(row)}
                    whileDrag={{ scale: 1.01, zIndex: 5, position: "relative" }}
                  >
                    {columns.map((c) => (
                      <td key={c.key}>
                        {morphIdPrefix && c.key === morphKey_ ? (
                          <Morph layoutId={`${morphIdPrefix}-${row.id}`}>
                            {c.render(row)}
                          </Morph>
                        ) : (
                          c.render(row)
                        )}
                      </td>
                    ))}
                    {actions.length > 0 && (
                      <td>
                        {actions.map((a) => (
                          <button
                            key={a.label}
                            type="button"
                            onClick={() => a.onSelect(row)}
                          >
                            {a.label}
                          </button>
                        ))}
                      </td>
                    )}
                  </MRow>
                ) : (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    data-row-id={String(row.id)}
                    {...(row.id === selectedId
                      ? { "data-selected": "true", "aria-current": "true" }
                      : {})}
                  >
                    {columns.map((c) => (
                      <td key={c.key}>{c.render(row)}</td>
                    ))}
                    {actions.length > 0 && (
                      <td>
                        {actions.map((a) => (
                          <button
                            key={a.label}
                            type="button"
                            onClick={() => a.onSelect(row)}
                          >
                            {a.label}
                          </button>
                        ))}
                      </td>
                    )}
                  </tr>
                ),
              )}
            </AnimatePresence>
          )}
        </tbody>
      </table>
    </>
  );
}
