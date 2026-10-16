import { defineConfig } from "vitest/config";

// Root-level vitest project for repo scripts (scripts/ci).
export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts"],
    environment: "node",
  },
});
