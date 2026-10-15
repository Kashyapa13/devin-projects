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
      },
      fontFamily: {
        sans: ["system-ui", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [] as unknown[],
} as const;
