import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  server: { proxy: { "/api": process.env.API_PORT ?? "http://localhost:8080" } },
  build: { outDir: "dist-web", emptyOutDir: true },
});
