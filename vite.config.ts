import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  base: "/emporos/",
  build: {
    outDir: "../site",
    emptyOutDir: true,
  },
});
