/**
 * Fleet chrome — the shared app frame (ADR-0018): a sticky frosted
 * header, the pill-styled keyboard command dock, and the segmented
 * tab control. Presentational only; all labels arrive i18n'd from
 * the app. Styling lives in styles.css — components emit the class
 * contract, never inline theme values.
 */
import { useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";

/**
 * Sticky glass header: eyebrow + title on the brand side, whatever the
 * app needs (tabs, filters, the CommandDock) on the action side.
 * `narrow` shrinks the shared shell width (console-style apps).
 */
export function AppHeader({
  title,
  eyebrow,
  narrow,
  children,
}: {
  title: ReactNode;
  eyebrow?: ReactNode | undefined;
  narrow?: boolean | undefined;
  children?: ReactNode | undefined;
}): ReactElement {
  return (
    <header className={`appbar${narrow === true ? " shell-narrow" : ""}`}>
      <div className="appbar-inner">
        <div className="appbar-brand">
          {eyebrow !== undefined && eyebrow !== null ? (
            <span className="eyebrow">{eyebrow}</span>
          ) : null}
          <h1 className="title">{title}</h1>
        </div>
        {children !== undefined && children !== null ? (
          <div className="appbar-side">{children}</div>
        ) : null}
      </div>
    </header>
  );
}

export interface DockItem {
  /** The key cap text, e.g. "J/K", "C", "⏎". */
  keys: string;
  /** What the shortcut does (i18n'd by the app). */
  label: string;
}

/**
 * Pill-styled keyboard shortcut dock — sits inside the AppHeader
 * action side (or floats wherever the app mounts it).
 */
export function CommandDock({
  items,
  label = "Keyboard shortcuts",
}: {
  items: readonly DockItem[];
  label?: string | undefined;
}): ReactElement {
  return (
    <span className="dock" role="note" aria-label={label}>
      {items.map((i) => (
        <span className="dock-item" key={i.keys}>
          <kbd>{i.keys}</kbd>
          {i.label}
        </span>
      ))}
    </span>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Segmented tab control — sliding-pill buttons with aria-pressed
 * semantics (same contract the queue tabs already expose to e2e).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}): ReactElement {
  const navRef = useRef<HTMLElement>(null);
  const [thumb, setThumb] = useState({ left: 4, width: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const btn = navRef.current?.querySelector<HTMLElement>(
        'button[aria-pressed="true"]',
      );
      if (btn) setThumb({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value, options]);
  return (
    <nav className="seg" aria-label={ariaLabel} ref={navRef}>
      <span
        className="seg-thumb"
        aria-hidden="true"
        style={{ left: thumb.left, width: thumb.width }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </nav>
  );
}
