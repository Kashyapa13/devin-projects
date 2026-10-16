/**
 * Shared Tailwind preset — the fleet's design tokens. Apps do
 * `presets: [tailwindPreset]` in their tailwind.config. Data only; the
 * tailwindcss package itself stays an app devDependency.
 */
export const tailwindPreset = {
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1e40af",
          fg: "#ffffff",
          muted: "#93c5fd",
        },
        queue: {
          open: "#1d4ed8",
          claimed: "#b45309",
          blocked: "#b91c1c",
          done: "#15803d",
        },
        // Semantic tokens (ADR-0014 materials refresh) — dark-mode-ready:
        // apps map these to `dark:` variants; platform never hard-codes a theme.
        status: {
          pending: "#1d4ed8",
          inReview: "#b45309",
          approved: "#15803d",
          rejected: "#b91c1c",
          escalated: "#7c3aed",
        },
        risk: { low: "#15803d", med: "#b45309", high: "#b91c1c" },
        sla: { ok: "#15803d", soon: "#b45309", breach: "#b91c1c" },
      },
      fontFamily: {
        sans: ["system-ui", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      // Typography + spacing scale (ADR-0014) — one scale, fleet-wide.
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem", { lineHeight: "2rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
      },
      spacing: { touch: "2.75rem" },
      // Materials: layered elevation shadows (ADR-0014) — translucency
      // comes from backdrop-blur-* utilities on overlay classes.
      boxShadow: {
        "elev-1": "0 1px 2px rgb(0 0 0 / 0.06), 0 1px 1px rgb(0 0 0 / 0.04)",
        "elev-2": "0 4px 12px rgb(0 0 0 / 0.10), 0 1px 3px rgb(0 0 0 / 0.06)",
        "elev-3": "0 12px 32px rgb(0 0 0 / 0.16), 0 2px 8px rgb(0 0 0 / 0.08)",
      },
    },
  },
  plugins: [] as unknown[],
} as const;
