import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  server: { proxy: { "/api": "http://localhost:8080" } },
  build: { outDir: "dist-web", emptyOutDir: true },
});
