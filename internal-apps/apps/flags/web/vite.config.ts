import { defineConfig } from "vite";

// `vite build web` from the package root — esbuild compiles tsx.
export default defineConfig({
  server: { proxy: { "/api": "http://localhost:8082" } },
  build: {
    outDir: "../dist-web",
    emptyOutDir: true,
  },
});
