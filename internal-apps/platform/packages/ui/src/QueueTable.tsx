import { memo, type ReactElement, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { FocusGlide } from "./motion.js";

export interface QueueColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

export interface QueueAction<T> {
  label: string;
  onSelect: (row: T) => void;
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
  /** Per-row motion props (drag/swipe/exit). Merges onto <motion.tr>. */
  rowMotion?: ((row: T) => HTMLMotionProps<"tr">) | undefined;
  /** When set, the keyboard cursor glides between rows (motion law). */
  glideId?: string | undefined;
}

interface RowProps<T extends { id: string | number }> {
  row: T;
  isSelected: boolean;
  columns: QueueColumn<T>[];
  actions: QueueAction<T>[];
  glideId?: string | undefined;
  rowMotion?: ((row: T) => HTMLMotionProps<"tr">) | undefined;
}

// Every observable prop compared by reference — callers must memoize
// columns/actions/rowMotion for the skip to hold (documented contract).
// Keeps a j/k selection change at ~2 re-rendered rows, not 50.
const QueueRow = memo(function QueueRow<T extends { id: string | number }>({
  row,
  isSelected,
  columns,
  actions,
  glideId,
  rowMotion,
}: RowProps<T>) {
  const RowEl = motion.tr;
  return (
    <RowEl
      tabIndex={0}
      data-row-id={String(row.id)}
      {...(isSelected
        ? { "data-selected": "true", "aria-current": "true" }
        : {})}
      {...(rowMotion ? rowMotion(row) : {})}
    >
      {columns.map((c) => (
        <td key={c.key}>
          {glideId !== undefined && isSelected && c.key === columns[0]?.key ? (
            <>
              <FocusGlide glideId={glideId} />
              {c.render(row)}
            </>
          ) : (
            c.render(row)
          )}
        </td>
      ))}
      {actions.length > 0 && (
        <td>
          {actions.map((a) => (
            <button key={a.label} type="button" onClick={() => a.onSelect(row)}>
              {a.label}
            </button>
          ))}
        </td>
      )}
    </RowEl>
  );
}, (a, b) =>
  a.row === b.row &&
  a.isSelected === b.isSelected &&
  a.columns === b.columns &&
  a.actions === b.actions &&
  a.glideId === b.glideId &&
  a.rowMotion === b.rowMotion) as <
  T extends { id: string | number }
>(props: RowProps<T>) => ReactElement;
const TypedQueueRow = QueueRow;

/**
 * Accessible queue table — semantic <table>/<th scope>/<caption>, rows
 * are real focusable elements, actions are real buttons. Axe-clean by
 * construction; verified per-component in tests.
 */
export function QueueTable<T extends { id: string | number }>({
  caption,
  columns,
  rows,
  actions = [],
  emptyMessage = "No items",
  selectedId,
  rowMotion,
  glideId,
}: QueueTableProps<T>) {
  return (
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
          rows.map((row) => (
            <TypedQueueRow
              key={row.id}
              row={row}
              isSelected={row.id === selectedId}
              columns={columns}
              actions={actions}
              glideId={glideId}
              {...(rowMotion !== undefined ? { rowMotion } : {})}
            />
          ))
        )}
      </tbody>
    </table>
  );
}
