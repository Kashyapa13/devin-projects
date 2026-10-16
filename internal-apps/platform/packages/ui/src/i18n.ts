import i18next, { type i18n, type Resource } from "i18next";
import { initReactI18next } from "react-i18next";

export interface I18nOptions {
  resources: Resource;
  lng?: string;
  fallbackLng?: string;
  /** Called on every missing key — the hard gate's tripwire. */
  onMissingKey?: (key: string) => void;
}

/**
 * i18next wrapper enforcing the all-strings-externalized gate: missing
 * keys warn loudly and render the raw key (never an empty string, never
 * an inlined fallback), so untranslated strings are visible, not silent.
 */
export function initI18n(opts: I18nOptions): i18n {
  const instance = i18next.createInstance();
  instance.use(initReactI18next).init({
    resources: opts.resources,
    lng: opts.lng ?? "en",
    fallbackLng: opts.fallbackLng ?? "en",
    interpolation: { escapeValue: false },
    returnEmptyString: false,
    parseMissingKeyHandler: (key) => {
      opts.onMissingKey?.(key);
      // eslint-disable-next-line no-console
      console.warn(`i18n missing key: ${key}`);
      return key;
    },
  });
  return instance;
}

export { useTranslation } from "react-i18next";
