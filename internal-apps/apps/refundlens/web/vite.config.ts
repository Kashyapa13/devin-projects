import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  server: { proxy: { "/api": "http://localhost:8083" } },
  build: { outDir: "dist-web", emptyOutDir: true },
});
