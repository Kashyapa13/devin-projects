/** Minimal Playwright `page` shape — the real type stays an app-side dep. */
export interface PageLike {
  keyboard: {
    press(key: string): Promise<void>;
  };
}

export interface KeyboardMode {
  pressSeq(keys: string[]): Promise<void>;
  /**
   * Walk the focus order: press `nextKey` (default Tab), then assert the
   * focused element's accessible label matches each expected entry.
   * `getFocused` is app-provided (e.g. () => page.evaluate(() =>
   * document.activeElement?.ariaLabel ?? document.activeElement?.textContent)).
   */
  expectFocusOrder(
    getFocused: () => Promise<string | null>,
    expected: string[],
    nextKey?: string,
  ): Promise<void>;
}

/** Playwright keyboard-mode helpers — keyboard is the test path, not the mouse. */
export function keyboardMode(page: PageLike): KeyboardMode {
  return {
    async pressSeq(keys) {
      for (const key of keys) {
        await page.keyboard.press(key);
      }
    },
    async expectFocusOrder(getFocused, expected, nextKey = "Tab") {
      for (const want of expected) {
        await page.keyboard.press(nextKey);
        const got = await getFocused();
        if (got !== want) {
          throw new Error(
            `focus order mismatch: expected "${want}", got "${got ?? "(nothing)"}"`,
          );
        }
      }
    },
  };
}
