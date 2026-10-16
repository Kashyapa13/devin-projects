/**
 * Externalized strings — the i18next hard gate. Real apps ship one JSON
 * resource per locale; the key, never the text, lives in components.
 */
export const resources = {
  en: {
    translation: {
      "app.title": "Template App",
      "queue.caption": "Work queue",
      "queue.empty": "Nothing queued",
      "col.id": "ID",
      "col.title": "Title",
      "col.status": "Status",
      "action.open": "Open",
    },
  },
} as const;
