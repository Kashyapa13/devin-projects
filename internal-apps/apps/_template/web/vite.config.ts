import { defineConfig } from "vite";

// `vite build web` from the package root — esbuild compiles tsx.
export default defineConfig({
  build: {
    outDir: "dist-web",
    emptyOutDir: true,
  },
});
