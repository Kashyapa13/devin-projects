import { useEffect } from "react";

/** Queue actions addressable by key — j/k/c/a/r by default. */
export interface QueueKeys {
  next: () => void;
  prev: () => void;
  claim: () => void;
  assign: () => void;
  refresh: () => void;
  reject: () => void;
  note?: () => void;
  escalate?: () => void;
  open?: () => void;
  back?: () => void;
}

export type QueueAction = keyof QueueKeys;
export type KeyMap = Record<string, QueueAction>;

export const defaultKeyMap: KeyMap = {
  j: "next",
  k: "prev",
  c: "claim",
  a: "assign",
  r: "refresh",
};

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

/**
 * Keyboard-mode queue navigation (constitution: Playwright keyboard-mode
 * is a first-class test path). Default bindings j/k/c/a/r are fully
 * remappable via `keyMap`. Ignores keys typed into editable fields.
 */
export function useKeyboardNav(
  handlers: Partial<QueueKeys>,
  keyMap: KeyMap = defaultKeyMap,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      const action = keyMap[e.key];
      const handler = action ? handlers[action] : undefined;
      if (handler) {
        e.preventDefault();
        handler();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handlers, keyMap, enabled]);
}
