import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["api/src/**/*.ts"],
      reporter: ["text", "json-summary"],
      thresholds: {
        // Charter: pure-logic modules ≥90% branches; routes/services ≥80%.
        "api/src/eval.ts": { branches: 90, lines: 90, functions: 90, statements: 90 },
        "api/src/server.ts": { branches: 80, lines: 80, functions: 80, statements: 80 },
      },
    },
  },
});
