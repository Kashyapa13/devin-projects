import type { ReactNode } from "react";

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
}

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
          ))
        )}
      </tbody>
    </table>
  );
}
